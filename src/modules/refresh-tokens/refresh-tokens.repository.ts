import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

import {
  RefreshToken,
  type RefreshTokenDocument,
  type RefreshTokenModel,
} from './schemas/refresh-token.schema';
import { CreateRefreshTokenData } from './types';

/** The only place that talks to the `refresh_tokens` collection. */
@Injectable()
export class RefreshTokensRepository {
  constructor(
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: RefreshTokenModel,
  ) {}

  async create(data: CreateRefreshTokenData): Promise<RefreshTokenDocument> {
    return this.refreshTokenModel.create(data);
  }

  /** Served by `uniq_refresh_token_hash`. */
  async findByHash(tokenHash: string): Promise<RefreshTokenDocument | null> {
    return this.refreshTokenModel.findOne({ tokenHash }).exec();
  }

  async revokeById(id: Types.ObjectId): Promise<boolean> {
    const result = await this.refreshTokenModel
      .updateOne(
        { _id: id, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      )
      .exec();
    return result.modifiedCount === 1;
  }

  /** Served by `user_sessions`. Returns how many were live. */
  async revokeAllForUser(user: Types.ObjectId): Promise<number> {
    const result = await this.refreshTokenModel
      .updateMany(
        { user, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      )
      .exec();
    return result.modifiedCount;
  }
}
