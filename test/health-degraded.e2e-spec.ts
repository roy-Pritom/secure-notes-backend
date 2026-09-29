import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { APP_CONFIG_KEY, AppConfig } from '../src/config';

interface HealthBody {
  status: string;
  info: Record<string, { status: string }>;
  error: Record<string, { status: string }>;
  details: Record<string, { status: string }>;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Kills mongod and asserts the failure response, which is the payload
// monitoring tools actually parse.
describe('Health checks with MongoDB down (e2e)', () => {
  let mongod: MongoMemoryServer;
  let app: NestExpressApplication;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongod.getUri();
    process.env.MONGODB_DB_NAME = 'health-degraded';

    const moduleFixture = await Test.createTestingModule({
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

  it('reports readiness up while the database is reachable', async () => {
    const body = (
      await request(app.getHttpServer()).get('/health/readiness').expect(200)
    ).body as HealthBody;

    expect(body.status).toBe('ok');
    expect(body.details['mongodb-connection']).toMatchObject({
      status: 'up',
      state: 'connected',
    });
  });

  describe('once mongod is stopped', () => {
    beforeAll(async () => {
      await mongod.stop();
      // Give the driver a moment to notice the socket is gone.
      await sleep(2500);
    }, 30_000);

    it('fails readiness with 503 so the pod leaves the load balancer', async () => {
      const body = (
        await request(app.getHttpServer()).get('/health/readiness').expect(503)
      ).body as HealthBody;

      // The global filter must not reshape Terminus' payload.
      expect(body.status).toBe('error');
      expect(body).toHaveProperty('info');
      expect(body).toHaveProperty('details');
      expect(body.error['mongodb-connection']).toMatchObject({
        status: 'down',
        state: 'disconnected',
      });
      expect(body).not.toHaveProperty('statusCode');
    });

    it('keeps liveness green so a DB outage never restarts healthy pods', async () => {
      const body = (
        await request(app.getHttpServer()).get('/health/liveness').expect(200)
      ).body as HealthBody;
      expect(body.status).toBe('ok');
    });

    it('still answers the cheap ping probe', async () => {
      await request(app.getHttpServer()).get('/health/ping').expect(200);
    });
  });
});
