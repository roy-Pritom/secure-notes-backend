import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

import { toBoolean, toInt } from '../common/transformers';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Staging = 'staging',
  Production = 'production',
}

/**
 * Fail-fast contract for `process.env`. A missing or malformed variable stops
 * the process from booting instead of failing later on the first query.
 */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty()
  API_PREFIX: string = 'api';

  /** Comma separated list of allowed browser origins, or `*` in development. */
  @IsString()
  @IsNotEmpty()
  CORS_ORIGINS: string = '*';

  @IsUrl(
    { protocols: ['mongodb', 'mongodb+srv'], require_tld: false },
    { message: 'MONGODB_URI must be a mongodb:// or mongodb+srv:// URI' },
  )
  MONGODB_URI!: string;

  @IsString()
  @IsNotEmpty()
  MONGODB_DB_NAME!: string;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  MONGODB_MAX_POOL_SIZE: number = 10;

  @Transform(toInt)
  @IsInt()
  @Min(0)
  MONGODB_MIN_POOL_SIZE: number = 0;

  @Transform(toInt)
  @IsInt()
  @Min(1000)
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: number = 5000;

  /** Logs every executed query. Never enable in production. */
  @Transform(toBoolean)
  @IsBoolean()
  MONGODB_DEBUG: boolean = false;

  @IsString()
  @MinLength(32, { message: 'JWT_SECRET must be at least 32 characters' })
  JWT_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_EXPIRES_IN: string = '15m';

  @Transform(toInt)
  @IsInt()
  @Min(10)
  @Max(15)
  BCRYPT_SALT_ROUNDS: number = 12;

  @Transform(toInt)
  @IsInt()
  @Min(1000)
  THROTTLE_TTL_MS: number = 60_000;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT: number = 100;
}

export function validateEnv(
  raw: Record<string, unknown>,
): EnvironmentVariables {
  const config = plainToInstance(EnvironmentVariables, raw, {
    enableImplicitConversion: false,
    exposeDefaultValues: true,
  });

  const errors = validateSync(config, {
    skipMissingProperties: false,
    whitelist: false,
  });

  if (errors.length > 0) {
    const details = errors
      .map(
        (error) =>
          `  - ${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`,
      )
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return config;
}
