import { NestExpressApplication } from '@nestjs/platform-express';
import { Types } from 'mongoose';
import request from 'supertest';

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

interface UserPostsBody extends PageBody<{ id: string; title: string }> {
  author: { id: string; fullName: string; email: string };
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

describe('Aggregations (e2e)', () => {
  let harness: Harness;
  let app: NestExpressApplication;
  let admin: Account;
  let ada: Account;

  beforeAll(async () => {
    harness = await startHarness('e2e-aggregations');
    app = harness.app;

    admin = await registerAdmin(harness, 'agg-admin@example.com');
    ada = await register(app, 'ada@example.com', {
      interests: ['chess', 'reading'],
    });
    await register(app, 'bo@example.com', { interests: ['chess'] });
    await register(app, 'cy@example.com', { interests: ['gardening'] });
    await register(app, 'no-interests@example.com');

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

    it('is served by the interests index, not a collection scan', async () => {
      // Run through `explain` as a raw command: the connection's majority
      // write concern is not allowed on an explained aggregate.
      const explain: unknown = await harness.connection.db?.command({
        explain: {
          aggregate: 'users',
          pipeline: [
            { $match: { isDeleted: false, interests: 'chess' } },
            { $unwind: '$interests' },
            { $group: { _id: '$interests', userCount: { $sum: 1 } } },
          ],
          cursor: {},
        },
        verbosity: 'queryPlanner',
      });

      const stages = stageNames(explain);
      expect(stages).toContain('IXSCAN');
      expect(stages).not.toContain('COLLSCAN');
    });
  });

  describe('scenario 2 — a user with their posts ($lookup)', () => {
    it('returns the author and a page of their posts', async () => {
      const body = (
        await request(app.getHttpServer())
          .get(`/api/v1/users/${ada.id}/posts?limit=2`)
          .set(...auth(admin))
          .expect(200)
      ).body as UserPostsBody;

      expect(body.author).toMatchObject({
        id: ada.id,
        email: 'ada@example.com',
      });
      expect(body.items).toHaveLength(2);
      expect(body.meta).toMatchObject({ total: 3, limit: 2, page: 1 });
      // Newest first.
      expect(body.items[0].title).toBe('Post three');
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

    it("reads an author's posts in order straight from the index", async () => {
      const explain = (await harness.connection
        .collection('posts')
        .find({ author: new Types.ObjectId(ada.id), isDeleted: false })
        .sort({ createdAt: -1 })
        .explain()) as unknown;

      const stages = stageNames(explain);
      expect(stages).toContain('IXSCAN');
      // The index already stores the order, so nothing is sorted in memory.
      expect(stages).not.toContain('SORT');
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
        'uniq_active_email',
      ]);
      expect(await names('notes')).toEqual([
        '_id_',
        'all_notes_by_created',
        'own_notes_by_created',
        'own_notes_by_tag',
      ]);
      expect(await names('posts')).toEqual(['_id_', 'posts_by_author_created']);
      expect(await names('refresh_tokens')).toEqual([
        '_id_',
        'expired_sessions_ttl',
        'uniq_refresh_token_hash',
        'user_sessions_by_expiry',
      ]);
    });
  });
});
