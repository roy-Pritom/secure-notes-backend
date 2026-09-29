import { UserRole } from '../../users/enums';

/** Signed into every token; `sub` is the user id. */
export interface JwtPayload {
  sub: string;
  email: string;
  roles: UserRole[];
}

/** What the guard attaches to `request.user`. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: UserRole[];
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
