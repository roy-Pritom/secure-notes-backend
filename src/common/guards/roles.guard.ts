import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

import { ROLES_KEY } from '../../modules/auth/decorators';
import { AuthenticatedUser } from '../../modules/auth/types';
import { UserRole } from '../../modules/users/enums';

/** Enforces `@Roles()`. Runs after `JwtAuthGuard`, so `request.user` is set. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) {
      return true;
    }

    const { user } = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();

    if (!user?.roles.some((role) => required.includes(role))) {
      throw new ForbiddenException('Insufficient role for this operation');
    }
    return true;
  }
}
