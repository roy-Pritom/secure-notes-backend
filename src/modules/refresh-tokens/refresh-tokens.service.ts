import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';

import { hashToken } from '../../common/utils';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { RefreshTokenDocument } from './schemas/refresh-token.schema';

@Injectable()
export class RefreshTokensService {
  private readonly logger = new Logger(RefreshTokensService.name);

  constructor(private readonly repository: RefreshTokensRepository) {}

  /** Opens a session for a freshly issued token. */
  issue(
    user: Types.ObjectId,
    refreshToken: string,
    expiresAt: Date,
  ): Promise<RefreshTokenDocument> {
    return this.repository.create({
      user,
      tokenHash: hashToken(refreshToken),
      expiresAt,
    });
  }

  /** The row a token names, live or not — the caller decides what that means. */
  findByToken(refreshToken: string): Promise<RefreshTokenDocument | null> {
    return this.repository.findByHash(hashToken(refreshToken));
  }

  /** Spends one session. `false` means someone else already spent it. */
  consume(id: Types.ObjectId): Promise<boolean> {
    return this.repository.revokeById(id);
  }

  /** Ends every live session a user holds. */
  async revokeAllForUser(user: Types.ObjectId): Promise<number> {
    const revoked = await this.repository.revokeAllForUser(user);
    if (revoked > 0) {
      this.logger.log(
        `Revoked ${revoked} session(s) for user ${user.toHexString()}`,
      );
    }
    return revoked;
  }
}
