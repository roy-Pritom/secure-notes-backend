import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { APP_CONFIG_KEY, AppConfig } from '../src/config';

interface HealthBody {
  status: string;
  details: Record<string, { status: string }>;
}

interface UserBody {
  id: string;
  email: string;
  fullName: string;
}

interface PageBody {
  items: unknown[];
  meta: { page: number; limit: number; total: number };
}

// Boots the real AppModule — config, pipes, filters, throttler — against an
// in-memory mongod.
describe('AppModule (e2e)', () => {
  let mongod: MongoMemoryServer;
  let app: NestExpressApplication;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    // Set before the module is built: dotenv does not override variables that
    // are already present, so this wins over `.env`.
    process.env.MONGODB_URI = mongod.getUri();
    process.env.MONGODB_DB_NAME = 'e2e';
    process.env.JWT_SECRET = 'e2e-secret-value-that-is-long-enough-1234';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApp(
      app,
      app.get(ConfigService).getOrThrow<AppConfig>(APP_CONFIG_KEY),
    );
    await app.init();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await mongod?.stop();
  });

  describe('health', () => {
    it('GET /health/ping answers without touching the database', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/ping')
        .expect(200);
      expect(response.body).toMatchObject({ status: 'ok' });
    });

    it('GET /health/readiness reports the database as up', async () => {
      const body = (
        await request(app.getHttpServer()).get('/health/readiness').expect(200)
      ).body as HealthBody;
      expect(body.status).toBe('ok');
      expect(body.details['mongodb-connection']).toMatchObject({
        status: 'up',
      });
      expect(body.details.mongodb).toMatchObject({ status: 'up' });
    });

    it('GET /health returns the full report', async () => {
      const body = (
        await request(app.getHttpServer()).get('/health').expect(200)
      ).body as HealthBody;
      expect(Object.keys(body.details).sort()).toEqual([
        'memory_heap',
        'memory_rss',
        'mongodb',
        'mongodb-connection',
      ]);
    });
  });

  describe('POST /api/v1/users', () => {
    const valid = {
      email: 'Ada@Example.com',
      password: 'C0rrect-Horse-Battery!',
      firstName: 'Ada',
      lastName: 'Lovelace',
    };

    it('creates a user, normalizing the email and hiding the hash', async () => {
      const body = (
        await request(app.getHttpServer())
          .post('/api/v1/users')
          .send(valid)
          .expect(201)
      ).body as UserBody;

      expect(body).toMatchObject({
        email: 'ada@example.com',
        fullName: 'Ada Lovelace',
      });
      expect(body).toHaveProperty('id');
      expect(body).not.toHaveProperty('passwordHash');
      expect(body).not.toHaveProperty('_id');
    });

    it('rejects unknown fields instead of silently dropping them', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send({ ...valid, email: 'x@example.com', isAdmin: true })
        .expect(400);
    });

    it('rejects a weak password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send({ ...valid, email: 'weak@example.com', password: 'password' })
        .expect(400);
    });

    it('returns 409 on a duplicate email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send({ ...valid, email: 'dupe@example.com' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send({ ...valid, email: 'dupe@example.com' })
        .expect(409);
    });
  });

  describe('GET /api/v1/users/:id', () => {
    it('rejects a malformed ObjectId with 400, not 500', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users/not-an-id')
        .expect(400);
    });

    it('returns 404 for an id that does not exist', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users/6650f1a2b3c4d5e6f7a8b9c0')
        .expect(404);
    });
  });

  describe('GET /api/v1/users', () => {
    it('rejects a limit above the allowed ceiling', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users?limit=1000')
        .expect(400);
    });

    it('returns pagination metadata', async () => {
      const body = (
        await request(app.getHttpServer())
          .get('/api/v1/users?limit=2&page=1')
          .expect(200)
      ).body as PageBody;
      expect(body).toHaveProperty('items');
      expect(body.meta).toMatchObject({ page: 1, limit: 2 });
    });
  });
});
