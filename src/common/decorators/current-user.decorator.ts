import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { Types } from 'mongoose';

import { AuthenticatedUser } from '../types';

/** The user the `JwtAuthGuard` resolved from the bearer token. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser =>
    context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>()
      .user,
);

/** The caller's id as an `ObjectId`, ready for a query. */
export const CurrentUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Types.ObjectId =>
    new Types.ObjectId(
      context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>()
        .user.id,
    ),
);
