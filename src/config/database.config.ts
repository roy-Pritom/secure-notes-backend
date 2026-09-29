import { registerAs } from '@nestjs/config';

import { NodeEnv } from './env.validation';

export const DATABASE_CONFIG_KEY = 'database';

export interface DatabaseConfig {
  uri: string;
  dbName: string;
  maxPoolSize: number;
  minPoolSize: number;
  serverSelectionTimeoutMS: number;
  debug: boolean;
  syncIndexesOnBoot: boolean;
}

export default registerAs<DatabaseConfig>(DATABASE_CONFIG_KEY, () => ({
  uri: process.env.MONGODB_URI as string,
  dbName: process.env.MONGODB_DB_NAME as string,
  maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE ?? 10),
  minPoolSize: Number(process.env.MONGODB_MIN_POOL_SIZE ?? 0),
  serverSelectionTimeoutMS: Number(
    process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS ?? 5000,
  ),
  debug: process.env.MONGODB_DEBUG === 'true',
  // Unset follows the environment: a developer's database keeps itself current,
  // a production deploy runs `pnpm db:indexes` before the new code takes
  // traffic. An explicit value wins either way.
  syncIndexesOnBoot:
    process.env.MONGODB_SYNC_INDEXES === undefined
      ? process.env.NODE_ENV !== NodeEnv.Production
      : process.env.MONGODB_SYNC_INDEXES === 'true',
}));
