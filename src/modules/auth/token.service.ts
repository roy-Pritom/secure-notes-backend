import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';

import { SECURITY_CONFIG_KEY, SecurityConfig } from '../../config';
import { JwtPayload, TokenPair } from './types';

type Expiry = JwtSignOptions['expiresIn'];

/** Signs and verifies the token pair. Access and refresh use separate secrets. */
@Injectable()
export class TokenService {
  private readonly security: SecurityConfig;

  constructor(
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.security =
      configService.getOrThrow<SecurityConfig>(SECURITY_CONFIG_KEY);
  }

  async issuePair(payload: JwtPayload): Promise<TokenPair> {
    const sign = (secret: string, expiresIn: string): Promise<string> =>
      this.jwtService.signAsync(
        { ...payload, jti: randomUUID() },
        { secret, expiresIn: expiresIn as Expiry },
      );

    const [accessToken, refreshToken] = await Promise.all([
      sign(this.security.jwtSecret, this.security.jwtExpiresIn),
      sign(this.security.jwtRefreshSecret, this.security.jwtRefreshExpiresIn),
    ]);

    return { accessToken, refreshToken };
  }

  expiresAt(token: string): Date {
    const { exp } = this.jwtService.decode<{ exp: number }>(token);
    return new Date(exp * 1000);
  }

  verifyRefreshToken(token: string): Promise<JwtPayload> {
    return this.jwtService.verifyAsync<JwtPayload>(token, {
      secret: this.security.jwtRefreshSecret,
    });
  }
}
