import { Module } from '@nestjs/common';

import { RefreshTokensModule } from '../refresh-tokens/refresh-tokens.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

// `JwtService` comes from the global `GuardsModule`; signing here always passes
// its secret explicitly, so no local registration is needed.
@Module({
  imports: [UsersModule, RefreshTokensModule],
  controllers: [AuthController],
  providers: [AuthService, TokenService],
})
export class AuthModule {}
