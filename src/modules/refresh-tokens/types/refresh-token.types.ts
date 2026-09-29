import { Types } from 'mongoose';

/** Fields the service is allowed to write when opening a session. */
export interface CreateRefreshTokenData {
  user: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
}
