import { UserRole } from '../../modules/users/enums';

/**
 * What `JwtAuthGuard` attaches to `request.user`, and what `@CurrentUser()`
 * hands back. It lives here rather than in the auth module because the common
 * guards and decorators are what produce and consume it.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: UserRole[];
}
