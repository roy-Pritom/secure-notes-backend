import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';

import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { SECURITY_CONFIG_KEY, SecurityConfig } from '../../config';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

@Module({
  imports: [
    UsersModule,
    // Only the access-token secret is registered here, for the guard's
    // `verifyAsync`. Signing always passes explicit options.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const security =
          configService.getOrThrow<SecurityConfig>(SECURITY_CONFIG_KEY);
        return { secret: security.jwtSecret };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    // Every route is authenticated and role-checked unless it opts out.
    // Both run after `ApiKeyGuard`, which `AppModule` registers first.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
