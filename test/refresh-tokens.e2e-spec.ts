import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { Types } from 'mongoose';

import {
  Account,
  auth,
  Harness,
  PASSWORD,
  register,
  registerAdmin,
  startHarness,
} from './utils/app-harness';

interface AuthBody {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string };
}

interface RefreshTokenRow {
  user: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

describe('Refresh token sessions (e2e)', () => {
  let harness: Harness;
  let app: NestExpressApplication;

  const rowsFor = (account: Account): Promise<RefreshTokenRow[]> =>
    harness.connection
      .collection<RefreshTokenRow>('refresh_tokens')
      .find({ user: new Types.ObjectId(account.id) })
      .toArray();

  const signIn = async (email: string): Promise<AuthBody> =>
    (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200)
    ).body as AuthBody;

  const refresh = (token: string, status: number): request.Test =>
    request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: token })
      .expect(status);

  beforeAll(async () => {
    harness = await startHarness('e2e-refresh-tokens');
    app = harness.app;
  }, 120_000);

  afterAll(async () => {
    await harness?.stop();
  });

  it('stores a digest and an expiry, never the token itself', async () => {
    const account = await register(app, 'stored@example.com');
    const [row, ...rest] = await rowsFor(account);

    expect(rest).toHaveLength(0);
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.tokenHash).not.toContain(account.refreshToken);
    expect(row.revokedAt).toBeNull();
    // The row expires with the token it tracks, not before it.
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.updatedAt).toBeInstanceOf(Date);
  });

  it('keeps one row per session, so two devices sign in independently', async () => {
    const account = await register(app, 'two-devices@example.com');
    const second = await signIn(account.email);

    expect(second.refreshToken).not.toBe(account.refreshToken);
    expect(await rowsFor(account)).toHaveLength(2);

    // Rotating the first session leaves the second one untouched — the whole
    // point of a row per token rather than one hash on the user.
    await refresh(account.refreshToken, 200);
    await refresh(second.refreshToken, 200);

    const revoked = (await rowsFor(account)).filter(
      (row) => row.revokedAt !== null,
    );
    expect(revoked).toHaveLength(2); // the two spent rows, not the replacements
    expect(await rowsFor(account)).toHaveLength(4);
  });

  it('revokes rather than deletes, so a spent session stays on the record', async () => {
    const account = await register(app, 'revoked@example.com');
    await refresh(account.refreshToken, 200);

    const [spent] = (await rowsFor(account)).filter(
      (row) => row.revokedAt !== null,
    );
    expect(spent.revokedAt).toBeInstanceOf(Date);
  });

  it('drops every session of the family when a spent token is replayed', async () => {
    const account = await register(app, 'replay@example.com');
    const other = await signIn(account.email);

    await refresh(account.refreshToken, 200);
    // The spent token comes back: treat the whole family as compromised.
    await refresh(account.refreshToken, 401);

    const live = (await rowsFor(account)).filter(
      (row) => row.revokedAt === null,
    );
    expect(live).toHaveLength(0);
    await refresh(other.refreshToken, 401);
  });

  it('ends every session on logout', async () => {
    const account = await register(app, 'logout-all@example.com');
    const second = await signIn(account.email);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set(...auth(account))
      .expect(204);

    expect(
      (await rowsFor(account)).every((row) => row.revokedAt !== null),
    ).toBe(true);
    await refresh(account.refreshToken, 401);
    await refresh(second.refreshToken, 401);
  });

  it('ends every session when an admin suspends the account', async () => {
    const admin = await registerAdmin(harness, 'session-admin@example.com');
    const account = await register(app, 'suspended@example.com');
    await signIn(account.email);

    await request(app.getHttpServer())
      .patch(`/api/v1/users/${account.id}`)
      .set(...auth(admin))
      .send({ status: 'suspended' })
      .expect(200);

    expect(
      (await rowsFor(account)).every((row) => row.revokedAt !== null),
    ).toBe(true);
    await refresh(account.refreshToken, 401);
  });

  it('declares the indexes the access paths need', async () => {
    const indexes = await harness.connection
      .collection('refresh_tokens')
      .indexes();
    const byName = new Map(indexes.map((index) => [index.name, index]));

    expect(byName.get('uniq_refresh_token_hash')).toMatchObject({
      key: { tokenHash: 1 },
      unique: true,
    });
    // `user` alone: `revokeAllForUser` is the only reader and never filters
    // on expiry, so a second key would be stored on every row and read by none.
    expect(byName.get('user_sessions')?.key).toEqual({ user: 1 });
    // TTL: expired rows age out on their own rather than growing forever.
    expect(byName.get('expired_sessions_ttl')).toMatchObject({
      key: { expiresAt: 1 },
      expireAfterSeconds: 86_400,
    });
  });
});
