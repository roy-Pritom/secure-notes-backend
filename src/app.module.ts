import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AllExceptionsFilter } from './common/filters';
import { AppValidationPipe } from './common/pipes/app-validation.pipe';
import { ConfigModule, SECURITY_CONFIG_KEY, SecurityConfig } from './config';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    // Must come first: everything below reads validated configuration.
    ConfigModule,
    DatabaseModule,

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const security =
          configService.getOrThrow<SecurityConfig>(SECURITY_CONFIG_KEY);
        return {
          throttlers: [
            { ttl: security.throttleTtlMs, limit: security.throttleLimit },
          ],
        };
      },
    }),

    HealthModule,
    UsersModule,
  ],
  providers: [
    // Registered as providers so they take part in DI and stay active in
    // e2e tests that build the module directly.
    { provide: APP_PIPE, useClass: AppValidationPipe },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
