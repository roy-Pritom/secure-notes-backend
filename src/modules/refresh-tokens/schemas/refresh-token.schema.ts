import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { HydratedDocument, Model, Types } from 'mongoose';

import { TimestampedSchema } from '../../../common/schemas/base.schema';
import { applyDocumentSerialization } from '../../../common/schemas/serialization';
import { User } from '../../users/schemas/user.schema';

export const REFRESH_TOKEN_COLLECTION = 'refresh_tokens';

export const EXPIRED_SESSION_GRACE_SECONDS = 86_400;

@Schema({
  collection: REFRESH_TOKEN_COLLECTION,
  timestamps: true,
  strict: 'throw',
  minimize: false,
})
export class RefreshToken extends TimestampedSchema {
  @ApiProperty({ example: '6650f1a2b3c4d5e6f7a8b9c0' })
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  user!: Types.ObjectId;


  @ApiHideProperty()
  @Prop({ type: String, required: true })
  tokenHash!: string;

  @ApiProperty({ type: Date })
  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  @ApiProperty({ type: Date, nullable: true })
  @Prop({ type: Date, default: null })
  revokedAt!: Date | null;
}

export interface RefreshTokenMethods {
  isActive(): boolean;
}

export type RefreshTokenDocument = HydratedDocument<RefreshToken> &
  RefreshTokenMethods;
export type RefreshTokenModel = Model<RefreshTokenDocument>;

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);

RefreshTokenSchema.index(
  { tokenHash: 1 },
  { unique: true, name: 'uniq_refresh_token_hash' },
);

// `revokeAllForUser` is the only query that reaches for a user's sessions,
// and it filters on `user` alone — `expiresAt` as a second key would be stored
// on every entry and read by nothing. Expiry is the TTL index's job below.
RefreshTokenSchema.index({ user: 1 }, { name: 'user_sessions' });

RefreshTokenSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: EXPIRED_SESSION_GRACE_SECONDS,
    name: 'expired_sessions_ttl',
  },
);

RefreshTokenSchema.methods.isActive = function (
  this: RefreshTokenDocument,
): boolean {
  return this.revokedAt === null && this.expiresAt.getTime() > Date.now();
};

// These never reach a response, but the digest must not leak if one ever does.
applyDocumentSerialization(RefreshTokenSchema, (_doc, ret) => {
  delete ret.tokenHash;
  return ret;
});
