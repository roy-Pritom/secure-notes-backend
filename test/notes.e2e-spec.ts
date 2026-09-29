import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import {
  Account,
  auth,
  Harness,
  register,
  registerAdmin,
  startHarness,
} from './utils/app-harness';

interface NoteBody {
  id: string;
  owner: string;
  title: string;
  content: string;
}

interface PageBody<T> {
  items: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

describe('Notes (e2e)', () => {
  let harness: Harness;
  let app: NestExpressApplication;
  let owner: Account;
  let other: Account;
  let admin: Account;
  let note: NoteBody;

  const createNote = async (
    account: Account,
    title: string,
  ): Promise<NoteBody> =>
    (
      await request(app.getHttpServer())
        .post('/api/v1/notes')
        .set(...auth(account))
        .send({ title, content: 'Body of ' + title })
        .expect(201)
    ).body as NoteBody;

  beforeAll(async () => {
    harness = await startHarness('e2e-notes');
    app = harness.app;
    owner = await register(app, 'owner@example.com');
    other = await register(app, 'other@example.com');
    admin = await registerAdmin(harness, 'notes-admin@example.com');

    note = await createNote(owner, 'First note');
    await createNote(owner, 'Second note');
    await createNote(other, "Someone else's note");
  }, 120_000);

  afterAll(async () => {
    await harness?.stop();
  });

  it('stamps the owner from the token, not the body', async () => {
    expect(note.owner).toBe(owner.id);

    await request(app.getHttpServer())
      .post('/api/v1/notes')
      .set(...auth(owner))
      .send({ title: 'Forged', content: 'x', owner: other.id })
      .expect(400);
  });

  it('lists only my own notes', async () => {
    const page = (
      await request(app.getHttpServer())
        .get('/api/v1/notes')
        .set(...auth(owner))
        .expect(200)
    ).body as PageBody<NoteBody>;

    expect(page.meta.total).toBe(2);
    expect(page.items.every((item) => item.owner === owner.id)).toBe(true);
  });

  it('paginates', async () => {
    const page = (
      await request(app.getHttpServer())
        .get('/api/v1/notes?page=2&limit=1')
        .set(...auth(owner))
        .expect(200)
    ).body as PageBody<NoteBody>;

    expect(page.items).toHaveLength(1);
    expect(page.meta).toMatchObject({ page: 2, limit: 1, totalPages: 2 });
  });

  it('treats an empty patch as a no-op rather than an error', async () => {
    const before = await createNote(owner, 'Untouched');

    const after = (
      await request(app.getHttpServer())
        .patch(`/api/v1/notes/${before.id}`)
        .set(...auth(owner))
        .send({})
        .expect(200)
    ).body as NoteBody;

    expect(after).toMatchObject({
      title: before.title,
      content: before.content,
    });
  });

  it("hides another user's note behind a 404", async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/notes/${note.id}`)
      .set(...auth(other))
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/v1/notes/${note.id}`)
      .set(...auth(other))
      .send({ title: 'Hijacked' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/v1/notes/${note.id}`)
      .set(...auth(other))
      .expect(404);
  });

  it('lets the owner read, update and delete', async () => {
    const created = await createNote(owner, 'Editable');

    const updated = (
      await request(app.getHttpServer())
        .patch(`/api/v1/notes/${created.id}`)
        .set(...auth(owner))
        .send({ title: 'Edited' })
        .expect(200)
    ).body as NoteBody;
    expect(updated).toMatchObject({
      title: 'Edited',
      content: created.content,
    });

    await request(app.getHttpServer())
      .delete(`/api/v1/notes/${created.id}`)
      .set(...auth(owner))
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/v1/notes/${created.id}`)
      .set(...auth(owner))
      .expect(404);
  });

  describe('admin', () => {
    it("reads everyone's notes", async () => {
      const mine = (
        await request(app.getHttpServer())
          .get('/api/v1/notes')
          .set(...auth(owner))
          .expect(200)
      ).body as PageBody<NoteBody>;

      const everyone = (
        await request(app.getHttpServer())
          .get('/api/v1/notes/all')
          .set(...auth(admin))
          .expect(200)
      ).body as PageBody<NoteBody>;

      expect(everyone.meta.total).toBeGreaterThan(mine.meta.total);
      expect(new Set(everyone.items.map((item) => item.owner)).size).toBe(2);

      await request(app.getHttpServer())
        .get(`/api/v1/notes/${note.id}`)
        .set(...auth(admin))
        .expect(200);
    });

    it('is still not allowed to edit them', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/notes/${note.id}`)
        .set(...auth(admin))
        .send({ title: 'Admin edit' })
        .expect(403);
    });

    it('keeps the cross-account listing away from a plain user', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/notes/all')
        .set(...auth(owner))
        .expect(403);
    });
  });
});
