import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { apiKey, Harness, PASSWORD, startHarness } from './utils/app-harness';

const PRIMARY_KEY = 'e2e-primary-client-key-0000000000';
const SECONDARY_KEY = 'e2e-secondary-client-key-11111111';

describe('x-api-key gate (e2e)', () => {
  let harness: Harness;
  let app: NestExpressApplication;

  beforeAll(async () => {
    harness = await startHarness('e2e-api-key', {
      apiKeys: [PRIMARY_KEY, SECONDARY_KEY],
    });
    app = harness.app;
  }, 120_000);

  afterAll(async () => {
    await harness?.stop();
  });

  it('rejects a public route with no key', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: PASSWORD })
      .expect(401);
  });

  it('rejects an unknown key', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set(...apiKey('not-a-configured-key-000000000000'))
      .send({
        email: 'rejected@example.com',
        password: PASSWORD,
        firstName: 'Re',
        lastName: 'Jected',
      })
      .expect(401);
  });

  it('accepts every configured key', async () => {
    for (const [index, key] of [PRIMARY_KEY, SECONDARY_KEY].entries()) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .set(...apiKey(key))
        .send({
          email: `client-${index}@example.com`,
          password: PASSWORD,
          firstName: 'Client',
          lastName: `${index}`,
        })
        .expect(201);
    }
  });

  it('runs before the bearer-token guard', async () => {
    // No key and no token: the client key is what the caller is told about
    // first, so an unknown client never reaches credential handling.
    const response = await request(app.getHttpServer())
      .get('/api/v1/notes')
      .expect(401);

    expect((response.body as { message: string }).message).toBe(
      'Missing x-api-key header',
    );
  });

  it('still requires a bearer token once the key is valid', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/notes')
      .set(...apiKey(PRIMARY_KEY))
      .expect(401);
  });

  it('leaves the health probes reachable without a key', async () => {
    await request(app.getHttpServer()).get('/health/liveness').expect(200);
    await request(app.getHttpServer()).get('/health/ping').expect(200);
  });
});
