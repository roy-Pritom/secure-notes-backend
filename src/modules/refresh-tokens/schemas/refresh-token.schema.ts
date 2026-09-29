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

  /**
   * SHA-256 of the token; the token itself is never stored, so a database dump
   * yields nothing replayable. A fast digest is correct here — the token is
   * already high-entropy, and bcrypt would truncate a JWT at 72 bytes.
   */
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

RefreshTokenSchema.index(
  { user: 1, expiresAt: 1 },
  { name: 'user_sessions_by_expiry' },
);

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
