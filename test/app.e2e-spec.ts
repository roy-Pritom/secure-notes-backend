import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import {
  Account,
  auth,
  Harness,
  PASSWORD,
  register,
  registerAdmin,
  startHarness,
} from './utils/app-harness';

interface HealthBody {
  status: string;
  details: Record<string, { status: string }>;
}

interface AuthBody {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; roles: string[] };
}

describe('Auth and access control (e2e)', () => {
  let harness: Harness;
  let app: NestExpressApplication;
  let user: Account;
  let admin: Account;

  beforeAll(async () => {
    harness = await startHarness('e2e-auth');
    app = harness.app;
    user = await register(app, 'user@example.com');
    admin = await registerAdmin(harness, 'admin@example.com');
  }, 120_000);

  afterAll(async () => {
    await harness?.stop();
  });

  describe('health', () => {
    it('answers probes without a token', async () => {
      await request(app.getHttpServer()).get('/health/ping').expect(200);

      const body = (
        await request(app.getHttpServer()).get('/health/readiness').expect(200)
      ).body as HealthBody;
      expect(body.details.mongodb).toMatchObject({ status: 'up' });
    });
  });

  describe('registration', () => {
    it('normalizes the email and never returns the hash', async () => {
      const body = (
        await request(app.getHttpServer())
          .post('/api/v1/auth/register')
          .send({
            email: 'Grace@Example.com',
            password: PASSWORD,
            firstName: 'Grace',
            lastName: 'Hopper',
          })
          .expect(201)
      ).body as AuthBody;

      expect(body.user).toMatchObject({
        email: 'grace@example.com',
        roles: ['user'],
      });
      expect(JSON.stringify(body)).not.toContain('passwordHash');
    });

    it('cannot grant itself a role', async () => {
      // `roles` is not part of RegisterDto, and unknown fields are rejected.
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'sneaky@example.com',
          password: PASSWORD,
          firstName: 'S',
          lastName: 'N',
          roles: ['admin'],
        })
        .expect(400);
    });

    it('rejects a weak password and a duplicate email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'weak@example.com',
          password: 'password',
          firstName: 'W',
          lastName: 'K',
        })
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: user.email,
          password: PASSWORD,
          firstName: 'D',
          lastName: 'P',
        })
        .expect(409);
    });
  });

  describe('login', () => {
    it('gives the same answer for a wrong password and an unknown account', async () => {
      const wrongPassword = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'Wrong-Password-123!' })
        .expect(401);

      const unknownEmail = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.com', password: PASSWORD })
        .expect(401);

      expect((wrongPassword.body as { message: string }).message).toBe(
        (unknownEmail.body as { message: string }).message,
      );
    });

    it('locks an account after repeated failures', async () => {
      const email = 'lockme@example.com';
      await register(app, email);

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email, password: 'Wrong-Password-123!' })
          .expect(401);
      }

      // Even the correct password is refused while the lock holds.
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: PASSWORD })
        .expect(403);
    });
  });

  describe('refresh tokens', () => {
    it('rotates the pair and refuses the token it replaced', async () => {
      const account = await register(app, 'rotate@example.com');

      const rotated = (
        await request(app.getHttpServer())
          .post('/api/v1/auth/refresh')
          .send({ refreshToken: account.refreshToken })
          .expect(200)
      ).body as AuthBody;

      expect(rotated.refreshToken).not.toBe(account.refreshToken);

      // Replaying the old token kills the session entirely.
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: account.refreshToken })
        .expect(401);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: rotated.refreshToken })
        .expect(401);
    });

    it('refuses an access token in place of a refresh token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: user.accessToken })
        .expect(401);
    });

    it('ends the session on logout', async () => {
      const account = await register(app, 'logout@example.com');

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set(...auth(account))
        .expect(204);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: account.refreshToken })
        .expect(401);
    });
  });

  describe('route protection', () => {
    it('rejects a missing or malformed token', async () => {
      await request(app.getHttpServer()).get('/api/v1/profile').expect(401);
      await request(app.getHttpServer())
        .get('/api/v1/profile')
        .set('Authorization', 'Bearer not-a-token')
        .expect(401);
    });

    it('keeps admin routes away from a plain user', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set(...auth(user))
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set(...auth(admin))
        .expect(200);
    });
  });

  describe('profile', () => {
    it('updates my own record and changes my password', async () => {
      const account = await register(app, 'profile@example.com');

      const updated = (
        await request(app.getHttpServer())
          .patch('/api/v1/profile')
          .set(...auth(account))
          .send({ firstName: 'Renamed', interests: ['Chess', ' Reading '] })
          .expect(200)
      ).body as { firstName: string; interests: string[] };

      expect(updated.firstName).toBe('Renamed');
      expect(updated.interests).toEqual(['chess', 'reading']);

      await request(app.getHttpServer())
        .patch('/api/v1/profile/password')
        .set(...auth(account))
        .send({
          currentPassword: PASSWORD,
          newPassword: 'An0ther-Strong-Pass!',
        })
        .expect(204);

      // The old session is gone once the password rotates.
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: account.refreshToken })
        .expect(401);
    });

    it('accepts an empty patch without touching the record', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/profile')
        .set(...auth(user))
        .send({})
        .expect(200);
    });

    it('refuses a profile update that tries to set roles', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/profile')
        .set(...auth(user))
        .send({ roles: ['admin'] })
        .expect(400);
    });
  });
});
