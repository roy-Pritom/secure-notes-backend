import { NestExpressApplication } from '@nestjs/platform-express';
import { PipelineStage, Types } from 'mongoose';
import request from 'supertest';

import { tokenSearchFilter } from '../src/common/search';
import { SearchTokensBackfillService } from '../src/database/search-tokens-backfill.service';
import { USERS_SEARCH_INDEX } from '../src/modules/users/schemas/user.schema';
import {
  interestGroupsPipeline,
  userPostsPipeline,
} from '../src/modules/users/aggregations';
import {
  Account,
  auth,
  Harness,
  register,
  registerAdmin,
  startHarness,
} from './utils/app-harness';

interface InterestGroup {
  interest: string;
  userCount: number;
  users: { id: string; fullName: string; email: string }[];
}

interface PageBody<T> {
  items: T[];
  meta: { total: number; page: number; limit: number };
}

interface UserPostsBody extends PageBody<{
  id: string;
  title: string;
  status: string;
}> {
  author: { id: string; fullName: string; email: string };
}

/**
 * Explains a pipeline as a raw command. It has to go through `db.command`
 * rather than `Model.aggregate().explain()` because the connection's majority
 * write concern is not allowed on an explained aggregate.
 */
async function explainPipeline(
  harness: Harness,
  collection: string,
  pipeline: PipelineStage[],
): Promise<unknown> {
  return harness.connection.db?.command({
    explain: { aggregate: collection, pipeline, cursor: {} },
    // `executionStats`, not `queryPlanner`: a `$lookup` reports the index it
    // joined on only once it has actually run.
    verbosity: 'executionStats',
  });
}

/** The `$lookup` stage's own account of how it resolved the join. */
interface LookupStats {
  collectionScans: number;
  indexesUsed: string[];
  totalDocsExamined: number;
}

function lookupStats(plan: unknown): LookupStats | undefined {
  if (Array.isArray(plan)) {
    for (const entry of plan) {
      const found = lookupStats(entry);
      if (found) return found;
    }
  } else if (plan && typeof plan === 'object') {
    const node = plan as Record<string, unknown>;
    if ('$lookup' in node && 'indexesUsed' in node) {
      return {
        collectionScans: node.collectionScans as number,
        indexesUsed: node.indexesUsed as string[],
        totalDocsExamined: node.totalDocsExamined as number,
      };
    }
    for (const value of Object.values(node)) {
      const found = lookupStats(value);
      if (found) return found;
    }
  }
  return undefined;
}

/** Walks an explain tree and collects every stage name it contains. */
function stageNames(plan: unknown, found: string[] = []): string[] {
  if (Array.isArray(plan)) {
    plan.forEach((entry) => stageNames(entry, found));
  } else if (plan && typeof plan === 'object') {
    for (const [key, value] of Object.entries(
      plan as Record<string, unknown>,
    )) {
      if (key === 'stage' && typeof value === 'string') {
        found.push(value);
      }
      stageNames(value, found);
    }
  }
  return found;
}

/** Every index the plan names, anywhere in the tree. */
function indexNames(plan: unknown, found: string[] = []): string[] {
  if (Array.isArray(plan)) {
    plan.forEach((entry) => indexNames(entry, found));
  } else if (plan && typeof plan === 'object') {
    for (const [key, value] of Object.entries(
      plan as Record<string, unknown>,
    )) {
      if (key === 'indexName' && typeof value === 'string') {
        found.push(value);
      }
      indexNames(value, found);
    }
  }
  return found;
}

describe('Aggregations (e2e)', () => {
  let harness: Harness;
  let app: NestExpressApplication;
  let admin: Account;
  let ada: Account;
  let bo: Account;

  beforeAll(async () => {
    harness = await startHarness('e2e-aggregations');
    app = harness.app;

    admin = await registerAdmin(harness, 'agg-admin@example.com');
    ada = await register(app, 'ada@example.com', {
      interests: ['chess', 'reading'],
    });
    bo = await register(app, 'bo@example.com', { interests: ['chess'] });
    await register(app, 'cy@example.com', { interests: ['gardening'] });
    await register(app, 'no-interests@example.com');

    // Written first, so "newest first" still leads with a published post.
    await request(app.getHttpServer())
      .post('/api/v1/posts')
      .set(...auth(ada))
      .send({
        title: 'Secret draft',
        body: 'Unfinished thoughts',
        status: 'draft',
      })
      .expect(201);

    for (const title of ['Post one', 'Post two', 'Post three']) {
      await request(app.getHttpServer())
        .post('/api/v1/posts')
        .set(...auth(ada))
        .send({ title, body: 'Public content' })
        .expect(201);
    }
  }, 120_000);

  afterAll(async () => {
    await harness?.stop();
  });

  describe('scenario 1 — users grouped by interests', () => {
    it('groups users and counts them, largest group first', async () => {
      const page = (
        await request(app.getHttpServer())
          .get('/api/v1/users/interests')
          .set(...auth(admin))
          .expect(200)
      ).body as PageBody<InterestGroup>;

      expect(page.items.map((group) => group.interest)).toEqual([
        'chess',
        'gardening',
        'reading',
      ]);
      expect(page.items[0]).toMatchObject({ interest: 'chess', userCount: 2 });
      expect(page.items[0].users).toHaveLength(2);
      // A user with no interests contributes no group.
      expect(page.meta.total).toBe(3);
    });

    it('filters to a single interest and paginates the groups', async () => {
      const filtered = (
        await request(app.getHttpServer())
          .get('/api/v1/users/interests?interest=CHESS')
          .set(...auth(admin))
          .expect(200)
      ).body as PageBody<InterestGroup>;

      expect(filtered.items).toHaveLength(1);
      expect(filtered.items[0]).toMatchObject({
        interest: 'chess',
        userCount: 2,
      });

      const paged = (
        await request(app.getHttpServer())
          .get('/api/v1/users/interests?limit=1&page=2')
          .set(...auth(admin))
          .expect(200)
      ).body as PageBody<InterestGroup>;
      expect(paged.items).toHaveLength(1);
      expect(paged.meta.total).toBe(3);
    });

    it('is admin-only', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users/interests')
        .set(...auth(ada))
        .expect(403);
    });

    // The pipeline the application actually runs, not a hand-written stand-in:
    // an approximation would keep passing after a change to the real one.
    it.each([
      { label: 'unfiltered', pipeline: () => interestGroupsPipeline(0, 20) },
      {
        label: 'filtered to one interest',
        pipeline: () => interestGroupsPipeline(0, 20, 'chess'),
      },
    ])(
      'is served by the interests index when $label, not a collection scan',
      async ({ pipeline }) => {
        const explain = await explainPipeline(harness, 'users', pipeline());

        expect(stageNames(explain)).toContain('IXSCAN');
        expect(stageNames(explain)).not.toContain('COLLSCAN');
        expect(indexNames(explain)).toContain('active_users_by_interest');
      },
    );
  });

  describe('scenario 2 — a user with their posts ($lookup)', () => {
    const postsOf = async (
      author: Account,
      viewer: Account,
      queryString = '',
    ): Promise<UserPostsBody> =>
      (
        await request(app.getHttpServer())
          .get(`/api/v1/users/${author.id}/posts${queryString}`)
          .set(...auth(viewer))
          .expect(200)
      ).body as UserPostsBody;

    it('returns the author and a page of their posts', async () => {
      const body = await postsOf(ada, admin, '?limit=2');

      expect(body.author).toMatchObject({
        id: ada.id,
        email: 'ada@example.com',
      });
      expect(body.items).toHaveLength(2);
      expect(body.meta).toMatchObject({ total: 4, limit: 2, page: 1 });
      // Newest first.
      expect(body.items[0].title).toBe('Post three');
    });

    it('shows drafts to their author and to admins', async () => {
      for (const viewer of [ada, admin]) {
        const body = await postsOf(ada, viewer);
        expect(body.meta.total).toBe(4);
        expect(body.items.map((post) => post.title)).toContain('Secret draft');
      }
    });

    it('leaves drafts out for every other reader — items and total alike', async () => {
      const body = await postsOf(ada, bo);

      expect(body.items.map((post) => post.status)).toEqual([
        'published',
        'published',
        'published',
      ]);
      // Counted in the pipeline, so the total never betrays a hidden draft.
      expect(body.meta.total).toBe(3);
    });

    it('does not let a search reach a draft the reader may not see', async () => {
      expect((await postsOf(ada, bo, '?searchTerm=secret')).meta.total).toBe(0);
      expect((await postsOf(ada, ada, '?searchTerm=secret')).meta.total).toBe(
        1,
      );
    });

    it('returns an empty page for an author with no posts', async () => {
      const body = (
        await request(app.getHttpServer())
          .get(`/api/v1/users/${admin.id}/posts`)
          .set(...auth(admin))
          .expect(200)
      ).body as UserPostsBody;

      expect(body.items).toEqual([]);
      expect(body.meta.total).toBe(0);
    });

    it('404s for a user that does not exist', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users/6650f1a2b3c4d5e6f7a8b9c0/posts')
        .set(...auth(admin))
        .expect(404);
    });

    it.each([
      { label: 'published only', status: 'published' },
      { label: 'drafts included', status: { $in: ['draft', 'published'] } },
    ])(
      "reads an author's posts in order straight from the index ($label)",
      async ({ status }) => {
        const explain = (await harness.connection
          .collection('posts')
          .find({
            author: new Types.ObjectId(ada.id),
            isDeleted: false,
            status,
          })
          .sort({ createdAt: -1 })
          .explain()) as { queryPlanner: { winningPlan: unknown } };

        // The winning plan only: rejected candidates routinely contain a SORT.
        const stages = stageNames(explain.queryPlanner.winningPlan);
        expect(stages).toContain('IXSCAN');
        // The index stores the order — for the `$in`, as two ordered ranges
        // merged (SORT_MERGE) — so nothing is sorted in memory.
        expect(stages).not.toContain('SORT');
      },
    );

    // The assertion above describes a `find` shaped like the join, not the
    // join itself. This one asks the `$lookup` stage how it really resolved.
    it.each([
      { label: 'the author', includeDrafts: true, examined: 4 },
      { label: 'another reader', includeDrafts: false, examined: 3 },
    ])(
      'joins through posts_by_author_status_created for $label, never scanning posts',
      async ({ includeDrafts, examined }) => {
        const stats = lookupStats(
          await explainPipeline(
            harness,
            'users',
            userPostsPipeline(new Types.ObjectId(ada.id), 0, 20, {
              includeDrafts,
            }),
          ),
        );

        expect(stats).toBeDefined();
        expect(stats?.indexesUsed).toEqual(['posts_by_author_status_created']);
        expect(stats?.collectionScans).toBe(0);
        // Only the posts this reader may see are touched — a hidden draft is
        // excluded by the index bounds, not fetched and then discarded.
        expect(stats?.totalDocsExamined).toBe(examined);
      },
    );

    it('answers a searchTerm from the token index, fetching only the match', async () => {
      const stats = lookupStats(
        await explainPipeline(
          harness,
          'users',
          userPostsPipeline(new Types.ObjectId(ada.id), 0, 20, {
            includeDrafts: true,
            searchTerm: 'three',
          }),
        ),
      );

      expect(stats?.indexesUsed).toEqual([
        'posts_by_author_status_search_token',
      ]);
      expect(stats?.collectionScans).toBe(0);
      // A regex over `title`/`body` would fetch all four posts to test them;
      // the token bounds mean only "Post three" is ever read.
      expect(stats?.totalDocsExamined).toBe(1);
    });
  });

  describe('searchTerm', () => {
    interface UserRow {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
    }

    const emails = (page: PageBody<UserRow>): string[] =>
      page.items.map((item) => item.email).sort();

    const users = async (queryString = ''): Promise<PageBody<UserRow>> =>
      (
        await request(app.getHttpServer())
          .get(`/api/v1/users${queryString}`)
          .set(...auth(admin))
          .expect(200)
      ).body as PageBody<UserRow>;

    // Registered without interests, so the grouping counts above stay whole.
    beforeAll(async () => {
      await register(app, 'lovelace@example.com', {
        firstName: 'Ada',
        lastName: 'Lovelace',
        bio: 'Writes about analytical engines.',
      });
      await register(app, 'hopper@example.com', {
        firstName: 'Grace',
        lastName: 'Hopper',
        bio: 'Writes about compilers.',
      });
    });

    it('finds a user by a word of their name, whatever the case', async () => {
      expect(emails(await users('?searchTerm=LOVELACE'))).toEqual([
        'lovelace@example.com',
      ]);
      expect(emails(await users('?searchTerm=grace'))).toEqual([
        'hopper@example.com',
      ]);
    });

    it('finds a user by their email or bio', async () => {
      expect(emails(await users('?searchTerm=hopper@'))).toEqual([
        'hopper@example.com',
      ]);
      expect(emails(await users('?searchTerm=analytical'))).toEqual([
        'lovelace@example.com',
      ]);
    });

    it('counts the matches and pages through them', async () => {
      // The two bios above; every other account was registered without one.
      const page = await users('?searchTerm=writes%20about&limit=1');

      expect(page.meta.total).toBe(2);
      expect(page.items).toHaveLength(1);
    });

    it('matches the start of a word, not any substring', async () => {
      expect(emails(await users('?searchTerm=love'))).toEqual([
        'lovelace@example.com',
      ]);
      // Inside a word is not a word start — the price of an indexable search.
      expect((await users('?searchTerm=lace')).meta.total).toBe(0);
    });

    it('takes the term as text, never as a pattern', async () => {
      expect((await users('?searchTerm=.*')).meta.total).toBe(0);
    });

    it('answers a search from the token index, reading only the matches', async () => {
      const explain = (await harness.connection
        .collection('users')
        .find({ isDeleted: false, ...tokenSearchFilter('writes about') })
        .sort({ createdAt: -1 })
        .hint(USERS_SEARCH_INDEX)
        .explain('executionStats')) as {
        executionStats: { nReturned: number; totalDocsExamined: number };
      };

      expect(indexNames(explain)).toContain(USERS_SEARCH_INDEX);
      expect(stageNames(explain)).not.toContain('COLLSCAN');
      expect(explain.executionStats.nReturned).toBe(2);
      // Nothing is fetched just to be thrown away by a regex.
      expect(explain.executionStats.totalDocsExamined).toBe(2);
    });

    it('keeps the tokens in step when a searchable field changes', async () => {
      const editor = await register(app, 'edit-me@example.com', {
        bio: 'Collects stamps.',
      });
      expect(emails(await users('?searchTerm=stamps'))).toEqual([
        'edit-me@example.com',
      ]);

      await request(app.getHttpServer())
        .patch('/api/v1/profile')
        .set(...auth(editor))
        .send({ bio: 'Grows orchids.' })
        .expect(200);

      expect((await users('?searchTerm=stamps')).meta.total).toBe(0);
      expect(emails(await users('?searchTerm=orchids'))).toEqual([
        'edit-me@example.com',
      ]);
      // Only the bio was sent; the other fields' tokens must survive it.
      expect(emails(await users('?searchTerm=edit-me'))).toEqual([
        'edit-me@example.com',
      ]);
    });

    it('backfills documents written before tokens existed', async () => {
      const now = new Date();
      await harness.connection.collection('users').insertOne({
        email: 'legacy@example.com',
        passwordHash: 'not-a-real-hash',
        firstName: 'Legacy',
        lastName: 'Account',
        roles: ['user'],
        status: 'active',
        avatarUrl: null,
        bio: null,
        interests: [],
        lastLoginAt: null,
        passwordChangedAt: now,
        isDeleted: false,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      expect((await users('?searchTerm=legacy')).meta.total).toBe(0);

      await app.get(SearchTokensBackfillService).backfill();

      expect(emails(await users('?searchTerm=legacy'))).toEqual([
        'legacy@example.com',
      ]);
      // A second run finds nothing left to do.
      expect(await app.get(SearchTokensBackfillService).backfill()).toBe(0);
    });

    it("searches an author's posts inside the $lookup", async () => {
      const matched = (
        await request(app.getHttpServer())
          .get(`/api/v1/users/${ada.id}/posts?searchTerm=THREE`)
          .set(...auth(admin))
          .expect(200)
      ).body as UserPostsBody;

      expect(matched.items.map((post) => post.title)).toEqual(['Post three']);
      // The `$match` runs ahead of the `$facet`, so the total is of the
      // matches — not of everything the author has written.
      expect(matched.meta.total).toBe(1);
      expect(matched.author.id).toBe(ada.id);

      const byBody = (
        await request(app.getHttpServer())
          .get(`/api/v1/users/${ada.id}/posts?searchTerm=public%20content`)
          .set(...auth(admin))
          .expect(200)
      ).body as UserPostsBody;
      expect(byBody.meta.total).toBe(3);
    });

    it('rejects an overlong term', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/users?searchTerm=${'a'.repeat(101)}`)
        .set(...auth(admin))
        .expect(400);
    });
  });

  describe('declared indexes', () => {
    const names = async (collection: string): Promise<string[]> =>
      (await harness.connection.collection(collection).indexes())
        .map((index) => index.name as string)
        .sort();

    it('creates exactly the indexes the queries need', async () => {
      expect(await names('users')).toEqual([
        '_id_',
        'active_users_by_created',
        'active_users_by_interest',
        'active_users_by_search_token',
        'uniq_active_email',
      ]);
      expect(await names('notes')).toEqual([
        '_id_',
        'all_notes_by_created',
        'all_notes_by_search_token',
        'own_notes_by_created',
        'own_notes_by_search_token',
      ]);
      expect(await names('posts')).toEqual([
        '_id_',
        'posts_by_author_status_created',
        'posts_by_author_status_search_token',
      ]);
      expect(await names('refresh_tokens')).toEqual([
        '_id_',
        'expired_sessions_ttl',
        'uniq_refresh_token_hash',
        'user_sessions',
      ]);
    });
  });
});
