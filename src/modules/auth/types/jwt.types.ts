import { UserRole } from '../../users/enums';

/** Signed into every token; `sub` is the user id. */
export interface JwtPayload {
  sub: string;
  email: string;
  roles: UserRole[];
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
