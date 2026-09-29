import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { APP_CONFIG_KEY, AppConfig } from '../../src/config';
import { UserRole } from '../../src/modules/users/enums';

export interface Harness {
  app: NestExpressApplication;
  connection: Connection;
  stop: () => Promise<void>;
}

export interface Account {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}

interface AuthBody {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string };
}

export const PASSWORD = 'C0rrect-Horse-Battery!';
export const BOOTSTRAP_ADMIN_EMAIL = 'bootstrap-admin@example.test';

/** Boots the real AppModule — config, guards, pipes, filters — on a fresh mongod. */
export async function startHarness(dbName: string): Promise<Harness> {
  const mongod = await MongoMemoryServer.create();

  // Set before the module is built: dotenv never overrides what is already
  // in `process.env`, so these win over `.env`.
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB_NAME = dbName;
  process.env.JWT_SECRET = 'e2e-access-secret-long-enough-to-pass-1234';
  process.env.JWT_REFRESH_SECRET = 'e2e-refresh-secret-long-enough-to-pass-56';
  // Login lockout has its own test; it must not trip the other specs.
  process.env.LOGIN_MAX_ATTEMPTS = '5';
  // Pinned so the seeded administrator cannot collide with a test account.
  process.env.BOOTSTRAP_ADMIN_EMAIL = BOOTSTRAP_ADMIN_EMAIL;
  process.env.BOOTSTRAP_ADMIN_PASSWORD = PASSWORD;

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(
    app,
    app.get(ConfigService).getOrThrow<AppConfig>(APP_CONFIG_KEY),
  );
  await app.init();

  const connection = app.get<Connection>(getConnectionToken());

  return {
    app,
    connection,
    stop: async () => {
      await app.close();
      await mongod.stop();
    },
  };
}

export async function register(
  app: NestExpressApplication,
  email: string,
  extra: Record<string, unknown> = {},
): Promise<Account> {
  const body = (
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password: PASSWORD,
        firstName: 'Test',
        lastName: 'User',
        ...extra,
      })
      .expect(201)
  ).body as AuthBody;

  return {
    id: body.user.id,
    email: body.user.email,
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
  };
}

/** Registers, then promotes directly in the database and signs in again. */
export async function registerAdmin(
  harness: Harness,
  email: string,
): Promise<Account> {
  const account = await register(harness.app, email);
  await harness.connection
    .collection('users')
    .updateOne({ email }, { $set: { roles: [UserRole.User, UserRole.Admin] } });

  const body = (
    await request(harness.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200)
  ).body as AuthBody;

  return {
    ...account,
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
  };
}

export const auth = (account: Account): [string, string] => [
  'Authorization',
  `Bearer ${account.accessToken}`,
];
