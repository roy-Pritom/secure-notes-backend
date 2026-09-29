import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';

import { SECURITY_CONFIG_KEY, SecurityConfig } from '../../config';
import { ApiKeyGuard } from './api-key.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

/**
 * Owns the guard stack and the single dependency it has.
 *
 * Global on purpose: `@UseGuards(JwtAuthGuard, RolesGuard)` resolves the guards
 * from the *controller's* module, so without this every feature module would
 * have to import a module just to be allowed to protect its own routes.
 */
@Global()
@Module({
  imports: [
    // Registered here rather than in `AuthModule` because it exists for the
    // guard's `verifyAsync`: only the access-token secret. Signing always
    // passes its secret explicitly, so `TokenService` is unaffected.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const security =
          configService.getOrThrow<SecurityConfig>(SECURITY_CONFIG_KEY);
        return { secret: security.jwtSecret };
      },
    }),
  ],
  providers: [
    ApiKeyGuard,
    JwtAuthGuard,
    RolesGuard,
    // The client gate is an edge concern that applies to the whole surface, so
    // it binds globally instead of being repeated on every controller.
    // `useExisting` keeps it to the one instance declared above.
    { provide: APP_GUARD, useExisting: ApiKeyGuard },
  ],
  exports: [ApiKeyGuard, JwtAuthGuard, RolesGuard, JwtModule],
})
export class GuardsModule {}
