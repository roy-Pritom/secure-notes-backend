import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

import { IS_PUBLIC_KEY } from '../../modules/auth/decorators';
import { AuthenticatedUser, JwtPayload } from '../../modules/auth/types';

/**
 * Applied globally, so a new route is protected unless it is explicitly
 * marked `@Public()` — the safe default is the one you get by forgetting.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const token = extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      request.user = {
        id: payload.sub,
        email: payload.email,
        roles: payload.roles,
      };
      return true;
    } catch {
      // The reason (expired, malformed, wrong signature) stays server-side.
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}

function extractBearerToken(request: Request): string | null {
  const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
  return scheme === 'Bearer' && token ? token : null;
}
