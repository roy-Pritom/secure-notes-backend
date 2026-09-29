import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { Types } from 'mongoose';

import {
  Account,
  auth,
  Harness,
  register,
  registerAdmin,
  startHarness,
} from './utils/app-harness';

interface Row {
  _id: Types.ObjectId;
  isDeleted: boolean;
  deletedAt: Date | null;
}

interface PageBody<T> {
  items: T[];
  meta: { total: number };
}

interface IdBody {
  id: string;
}

describe('Soft delete (e2e)', () => {
  let harness: Harness;
  let app: NestExpressApplication;
  let admin: Account;

  const row = async (collection: string, id: string): Promise<Row | null> =>
    harness.connection
      .collection<Row>(collection)
      .findOne({ _id: new Types.ObjectId(id) });

  beforeAll(async () => {
    harness = await startHarness('e2e-soft-delete');
    app = harness.app;
    admin = await registerAdmin(harness, 'soft-delete-admin@example.com');
  }, 120_000);

  afterAll(async () => {
    await harness?.stop();
  });

  describe('notes', () => {
    it('flags the row instead of removing it', async () => {
      const owner = await register(app, 'note-deleter@example.com');
      const note = (
        await request(app.getHttpServer())
          .post('/api/v1/notes')
          .set(...auth(owner))
          .send({ title: 'Doomed', content: 'Body' })
          .expect(201)
      ).body as IdBody;

      await request(app.getHttpServer())
        .delete(`/api/v1/notes/${note.id}`)
        .set(...auth(owner))
        .expect(204);

      const stored = await row('notes', note.id);
      expect(stored).not.toBeNull();
      expect(stored?.isDeleted).toBe(true);
      expect(stored?.deletedAt).toBeInstanceOf(Date);
    });

    it('drops it from the owner listing and the admin listing alike', async () => {
      const owner = await register(app, 'note-lister@example.com');
      const kept = (
        await request(app.getHttpServer())
          .post('/api/v1/notes')
          .set(...auth(owner))
          .send({ title: 'Kept', content: 'Body' })
          .expect(201)
      ).body as IdBody;
      const removed = (
        await request(app.getHttpServer())
          .post('/api/v1/notes')
          .set(...auth(owner))
          .send({ title: 'Removed', content: 'Body' })
          .expect(201)
      ).body as IdBody;

      await request(app.getHttpServer())
        .delete(`/api/v1/notes/${removed.id}`)
        .set(...auth(owner))
        .expect(204);

      const own = (
        await request(app.getHttpServer())
          .get('/api/v1/notes')
          .set(...auth(owner))
          .expect(200)
      ).body as PageBody<IdBody>;
      expect(own.items.map((item) => item.id)).toEqual([kept.id]);
      expect(own.meta.total).toBe(1);

      const all = (
        await request(app.getHttpServer())
          .get('/api/v1/notes/all?limit=100')
          .set(...auth(admin))
          .expect(200)
      ).body as PageBody<IdBody>;
      expect(all.items.map((item) => item.id)).not.toContain(removed.id);
    });
  });

  describe('users', () => {
    it('flags the row and drops it from the listing', async () => {
      const doomed = await register(app, 'doomed-user@example.com');

      await request(app.getHttpServer())
        .delete(`/api/v1/users/${doomed.id}`)
        .set(...auth(admin))
        .expect(204);

      const stored = await row('users', doomed.id);
      expect(stored?.isDeleted).toBe(true);
      expect(stored?.deletedAt).toBeInstanceOf(Date);

      const listing = (
        await request(app.getHttpServer())
          .get('/api/v1/users?limit=100')
          .set(...auth(admin))
          .expect(200)
      ).body as PageBody<IdBody>;
      expect(listing.items.map((item) => item.id)).not.toContain(doomed.id);

      await request(app.getHttpServer())
        .get(`/api/v1/users/${doomed.id}`)
        .set(...auth(admin))
        .expect(404);
    });

    it('frees the email address, because the unique index is partial', async () => {
      const email = 'recycled@example.com';
      const first = await register(app, email);

      await request(app.getHttpServer())
        .delete(`/api/v1/users/${first.id}`)
        .set(...auth(admin))
        .expect(204);

      // Same address, new account: a plain unique index would reject this.
      const second = await register(app, email);
      expect(second.id).not.toBe(first.id);
    });
  });

  describe('cascade from a deleted account', () => {
    it("ends the user's notes and posts, and clears them from the admin listing", async () => {
      const doomed = await register(app, 'cascade@example.com');

      const note = (
        await request(app.getHttpServer())
          .post('/api/v1/notes')
          .set(...auth(doomed))
          .send({ title: 'Orphan', content: 'Body' })
          .expect(201)
      ).body as IdBody;
      const post = (
        await request(app.getHttpServer())
          .post('/api/v1/posts')
          .set(...auth(doomed))
          .send({ title: 'Orphan post', body: 'Body' })
          .expect(201)
      ).body as IdBody;

      await request(app.getHttpServer())
        .delete(`/api/v1/users/${doomed.id}`)
        .set(...auth(admin))
        .expect(204);

      expect((await row('notes', note.id))?.isDeleted).toBe(true);
      expect((await row('posts', post.id))?.isDeleted).toBe(true);

      // Without the cascade the note would still be listed here: the notes
      // query filters notes, and never joins the owner.
      const all = (
        await request(app.getHttpServer())
          .get('/api/v1/notes/all?limit=100')
          .set(...auth(admin))
          .expect(200)
      ).body as PageBody<IdBody>;
      expect(all.items.map((item) => item.id)).not.toContain(note.id);
    });

    it('leaves other accounts untouched', async () => {
      const doomed = await register(app, 'cascade-victim@example.com');
      const bystander = await register(app, 'cascade-bystander@example.com');

      const kept = (
        await request(app.getHttpServer())
          .post('/api/v1/notes')
          .set(...auth(bystander))
          .send({ title: 'Survivor', content: 'Body' })
          .expect(201)
      ).body as IdBody;

      await request(app.getHttpServer())
        .delete(`/api/v1/users/${doomed.id}`)
        .set(...auth(admin))
        .expect(204);

      expect((await row('notes', kept.id))?.isDeleted).toBe(false);
      const own = (
        await request(app.getHttpServer())
          .get('/api/v1/notes')
          .set(...auth(bystander))
          .expect(200)
      ).body as PageBody<IdBody>;
      expect(own.items.map((item) => item.id)).toContain(kept.id);
    });
  });

  describe('posts', () => {
    it('hides a deleted post from the $lookup listing', async () => {
      const author = await register(app, 'post-author@example.com');

      const posts = await Promise.all(
        ['Kept post', 'Removed post'].map(
          async (title) =>
            (
              await request(app.getHttpServer())
                .post('/api/v1/posts')
                .set(...auth(author))
                .send({ title, body: 'Body of ' + title })
                .expect(201)
            ).body as IdBody,
        ),
      );

      // Posts have no delete route yet, so flag it the way one would.
      await harness.connection
        .collection('posts')
        .updateOne(
          { _id: new Types.ObjectId(posts[1].id) },
          { $set: { isDeleted: true, deletedAt: new Date() } },
        );

      const body = (
        await request(app.getHttpServer())
          .get(`/api/v1/users/${author.id}/posts`)
          .set(...auth(author))
          .expect(200)
      ).body as PageBody<IdBody>;

      expect(body.items.map((item) => item.id)).toEqual([posts[0].id]);
      expect(body.meta.total).toBe(1);
    });
  });

  describe('indexes', () => {
    it('puts isDeleted ahead of the sort key in every listing index', async () => {
      const keys = async (
        collection: string,
        name: string,
      ): Promise<Record<string, number> | undefined> =>
        (await harness.connection.collection(collection).indexes()).find(
          (index) => index.name === name,
        )?.key as Record<string, number> | undefined;

      // Key order is the point: an equality filter that sits after the sort
      // key cannot be read from the index, and the sort falls back to memory.
      expect(await keys('notes', 'own_notes_by_created')).toEqual({
        owner: 1,
        isDeleted: 1,
        isArchived: 1,
        isPinned: -1,
        createdAt: -1,
      });
      expect(await keys('notes', 'own_notes_by_tag')).toEqual({
        owner: 1,
        isDeleted: 1,
        isArchived: 1,
        tags: 1,
      });
      expect(await keys('notes', 'all_notes_by_created')).toEqual({
        isDeleted: 1,
        isArchived: 1,
        isPinned: -1,
        createdAt: -1,
      });
      expect(await keys('notes', 'all_notes_by_tag')).toEqual({
        isDeleted: 1,
        isArchived: 1,
        tags: 1,
      });
      expect(await keys('users', 'active_users_by_created')).toEqual({
        isDeleted: 1,
        createdAt: -1,
      });
      expect(await keys('users', 'active_users_by_interest')).toEqual({
        isDeleted: 1,
        interests: 1,
      });
      expect(await keys('posts', 'posts_by_author_created')).toEqual({
        author: 1,
        isDeleted: 1,
        createdAt: -1,
      });
    });

    it('keeps the email index unique only among live users', async () => {
      const index = (
        await harness.connection.collection('users').indexes()
      ).find((candidate) => candidate.name === 'uniq_active_email');

      expect(index).toMatchObject({
        unique: true,
        partialFilterExpression: { isDeleted: false },
      });
    });
  });
});

/**
 * Reads the plan MongoDB actually chose. Rejected plans sit in the same
 * document and routinely contain a SORT — walking the whole explain output
 * would fail a query that is in fact served straight from an index.
 */
function winningPlan(explain: unknown): {
  stages: string[];
  indexes: string[];
} {
  const planner = (explain as { queryPlanner?: { winningPlan?: unknown } })
    .queryPlanner;
  if (!planner?.winningPlan) {
    throw new Error('explain output carried no queryPlanner.winningPlan');
  }

  const stages: string[] = [];
  const indexes: string[] = [];

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== 'object') {
      return;
    }
    for (const [key, value] of Object.entries(
      node as Record<string, unknown>,
    )) {
      if (key === 'stage' && typeof value === 'string') stages.push(value);
      if (key === 'indexName' && typeof value === 'string') indexes.push(value);
      walk(value);
    }
  };

  walk(planner.winningPlan);
  return { stages, indexes };
}

/**
 * The listings above return the right rows either way — a collection scan and
 * an in-memory sort are correct, just ruinous. These assert the plan, which is
 * the half that the index key order actually decides.
 */
describe('Soft-delete listings read straight from an index (e2e)', () => {
  let harness: Harness;
  let app: NestExpressApplication;
  let owner: Account;

  beforeAll(async () => {
    harness = await startHarness('e2e-soft-delete-plans');
    app = harness.app;
    owner = await register(app, 'planner@example.com', {
      interests: ['chess'],
    });

    await request(app.getHttpServer())
      .post('/api/v1/notes')
      .set(...auth(owner))
      .send({ title: 'Planned', content: 'Body' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/posts')
      .set(...auth(owner))
      .send({ title: 'Planned post', body: 'Body' })
      .expect(201);
  }, 120_000);

  afterAll(async () => {
    await harness?.stop();
  });

  const planFor = async (
    collection: string,
    filter: Record<string, unknown>,
    sort: Record<string, 1 | -1>,
  ): Promise<{ stages: string[]; indexes: string[] }> =>
    winningPlan(
      await harness.connection
        .collection(collection)
        .find(filter)
        .sort(sort)
        .explain(),
    );

  const byCreated: Record<string, 1 | -1> = { createdAt: -1 };
  // Notes lead with the pinned ones, so their listings carry a two-key sort
  // and an `isArchived` equality the index has to cover as well.
  const pinnedFirst: Record<string, 1 | -1> = { isPinned: -1, createdAt: -1 };

  interface PlanCase {
    label: string;
    collection: string;
    indexName: string;
    filter: (ownerId: Types.ObjectId) => Record<string, unknown>;
    sort: Record<string, 1 | -1>;
  }

  const cases: PlanCase[] = [
    {
      label: 'a user-scoped note listing',
      collection: 'notes',
      indexName: 'own_notes_by_created',
      filter: (ownerId) => ({
        owner: ownerId,
        isDeleted: false,
        isArchived: false,
      }),
      sort: pinnedFirst,
    },
    {
      label: 'the admin note listing',
      collection: 'notes',
      indexName: 'all_notes_by_created',
      filter: () => ({ isDeleted: false, isArchived: false }),
      sort: pinnedFirst,
    },
    {
      label: 'the user listing',
      collection: 'users',
      indexName: 'active_users_by_created',
      filter: () => ({ isDeleted: false }),
      sort: byCreated,
    },
    {
      label: "an author's posts, as the $lookup reads them",
      collection: 'posts',
      indexName: 'posts_by_author_created',
      filter: (ownerId) => ({ author: ownerId, isDeleted: false }),
      sort: byCreated,
    },
  ];

  it.each(cases)(
    'serves $label from $indexName',
    async ({ collection, indexName, filter, sort }) => {
      const { stages, indexes } = await planFor(
        collection,
        filter(new Types.ObjectId(owner.id)),
        sort,
      );

      expect(indexes).toContain(indexName);
      expect(stages).toContain('IXSCAN');
      expect(stages).not.toContain('COLLSCAN');
      // The index stores the order, so nothing is sorted in memory.
      expect(stages).not.toContain('SORT');
    },
  );

  // Either note index can serve a tag filter: the `_by_tag` one matches the
  // tag from the index and sorts in memory, the `_by_created` one does the
  // reverse. Which one wins is the planner's call — the assertion is only that
  // it never falls back to reading every document.
  it.each([
    {
      label: "a user's own listing",
      scope: (ownerId: Types.ObjectId) => ({ owner: ownerId }),
      prefix: 'own_notes_by_',
    },
    {
      label: 'the admin listing',
      scope: () => ({}),
      prefix: 'all_notes_by_',
    },
  ])(
    'narrows $label to one tag without scanning the collection',
    async ({ scope, prefix }) => {
      const { stages, indexes } = await planFor(
        'notes',
        {
          ...scope(new Types.ObjectId(owner.id)),
          isDeleted: false,
          isArchived: false,
          tags: 'planning',
        },
        pinnedFirst,
      );

      expect(stages).toContain('IXSCAN');
      expect(stages).not.toContain('COLLSCAN');
      expect(indexes.some((name) => name.startsWith(prefix))).toBe(true);
    },
  );
});
