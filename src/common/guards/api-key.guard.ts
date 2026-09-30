import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

import { SECURITY_CONFIG_KEY, SecurityConfig } from '../../config';
import { SKIP_API_KEY_KEY } from '../decorators';
import { hashToken, tokenMatches } from '../utils';

export const API_KEY_HEADER = 'x-api-key';


@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);
  /** SHA-256 digests only: the keys themselves are never held in memory. */
  private readonly keyHashes: string[];

  constructor(
    private readonly reflector: Reflector,
    configService: ConfigService,
  ) {
    const { apiKeys } =
      configService.getOrThrow<SecurityConfig>(SECURITY_CONFIG_KEY);
    this.keyHashes = apiKeys.map(hashToken);

    if (this.keyHashes.length === 0) {
      this.logger.warn(
        `API_KEYS is empty — the ${API_KEY_HEADER} gate is disabled`,
      );
    }
  }

  canActivate(context: ExecutionContext): boolean {
    if (this.keyHashes.length === 0) {
      return true;
    }

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_API_KEY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return true;
    }

    const presented = readApiKey(context.switchToHttp().getRequest<Request>());
    if (!presented) {
      throw new UnauthorizedException(`Missing ${API_KEY_HEADER} header`);
    }
    // Same message either way: a caller learns nothing about which keys exist.
    if (!this.keyHashes.some((hash) => tokenMatches(presented, hash))) {
      throw new UnauthorizedException(`Invalid ${API_KEY_HEADER} header`);
    }
    return true;
  }
}

function readApiKey(request: Request): string | null {
  // Node joins a repeated header into one value; an ambiguous key is no key.
  const raw = request.headers[API_KEY_HEADER];
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
}
