import { SetMetadata } from '@nestjs/common';

import { UserRole } from '../../modules/users/enums';

export const ROLES_KEY = 'roles';

/** Restricts a route to the listed roles; without it any authenticated user passes. */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
