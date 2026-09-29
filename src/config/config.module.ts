import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

import appConfig from './app.config';
import databaseConfig from './database.config';
import { validateEnv } from './env.validation';
import securityConfig from './security.config';

/** The only place environment parsing happens; everything else injects the typed namespaces. */
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      validate: validateEnv,
      load: [appConfig, databaseConfig, securityConfig],
      envFilePath: [
        `.env.${process.env.NODE_ENV ?? 'development'}.local`,
        '.env.local',
        '.env',
      ],
    }),
  ],
})
export class ConfigModule {}
