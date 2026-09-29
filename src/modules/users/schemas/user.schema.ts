import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import * as bcrypt from 'bcrypt';
import { HydratedDocument, Model } from 'mongoose';

import { BaseSchema } from '../../../common/schemas/base.schema';
import { applyDocumentSerialization } from '../../../common/schemas/serialization';
import { UserRole, UserStatus } from '../enums';

export const USER_COLLECTION = 'users';

export const MAX_NAME_LENGTH = 80;
export const MAX_EMAIL_LENGTH = 254; // RFC 5321
export const MAX_INTERESTS = 20;
export const MAX_INTEREST_LENGTH = 40;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Schema({
  collection: USER_COLLECTION,
  timestamps: true,
  optimisticConcurrency: true,
  strict: 'throw', // reject unknown paths instead of dropping them silently
  minimize: false,
})
export class User extends BaseSchema {
  @ApiProperty({ example: 'ada@example.com', maxLength: MAX_EMAIL_LENGTH })
  @Prop({
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: MAX_EMAIL_LENGTH,
    match: EMAIL_PATTERN,
  })
  email!: string;

  /** bcrypt hash; loaded only via an explicit `.select('+passwordHash')`. */
  @ApiHideProperty()
  @Prop({ type: String, required: true, select: false })
  passwordHash!: string;

  @ApiProperty({ example: 'Ada', maxLength: MAX_NAME_LENGTH })
  @Prop({
    type: String,
    required: true,
    trim: true,
    maxlength: MAX_NAME_LENGTH,
  })
  firstName!: string;

  @ApiProperty({ example: 'Lovelace', maxLength: MAX_NAME_LENGTH })
  @Prop({
    type: String,
    required: true,
    trim: true,
    maxlength: MAX_NAME_LENGTH,
  })
  lastName!: string;

  @ApiProperty({ enum: UserRole, isArray: true, default: [UserRole.User] })
  @Prop({
    type: [String],
    enum: Object.values(UserRole),
    default: [UserRole.User],
  })
  roles!: UserRole[];

  @ApiProperty({ enum: UserStatus, default: UserStatus.Active })
  @Prop({
    type: String,
    enum: Object.values(UserStatus),
    default: UserStatus.Active,
  })
  status!: UserStatus;

  /** Profile tags such as `['chess', 'reading']`, grouped by the interests view. */
  @ApiProperty({ example: ['chess', 'reading'], isArray: true, type: String })
  @Prop({
    type: [String],
    default: [],
    trim: true,
    lowercase: true,
  })
  interests!: string[];

  @ApiProperty({ type: Date, nullable: true })
  @Prop({ type: Date, default: null })
  lastLoginAt!: Date | null;

  @ApiHideProperty()
  @Prop({ type: Number, default: 0, min: 0, select: false })
  failedLoginAttempts!: number;

  @ApiHideProperty()
  @Prop({ type: Date, default: null, select: false })
  lockedUntil!: Date | null;
}

export interface UserMethods {
  verifyPassword(plainText: string): Promise<boolean>;
  isLocked(): boolean;
  hasRole(role: UserRole): boolean;
}

export type UserDocument = HydratedDocument<User> & UserMethods;
export type UserModel = Model<UserDocument>;

export const UserSchema = SchemaFactory.createForClass(User);

/*
 * Indexes — one per access path, nothing speculative.
 *
 * 1. uniq_active_email      login and registration uniqueness
 * 2. active_users_by_created admin user listing (paginated, newest first)
 * 3. active_users_by_interest the "users grouped by interests" aggregation
 *
 * Reads of a single user go through `_id`, which MongoDB already indexes.
 */

// Unique among live users only, so a soft-deleted account frees its address.
UserSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { deletedAt: null },
    name: 'uniq_active_email',
  },
);

UserSchema.index(
  { deletedAt: 1, createdAt: -1 },
  { name: 'active_users_by_created' },
);

// Multikey: serves the `$match` + `$unwind`/`$group` on interests, and the
// optional single-interest filter on that view.
UserSchema.index(
  { deletedAt: 1, interests: 1 },
  { name: 'active_users_by_interest' },
);

UserSchema.virtual('fullName').get(function (this: UserDocument): string {
  return `${this.firstName} ${this.lastName}`.trim();
});

UserSchema.methods.verifyPassword = async function (
  this: UserDocument,
  plainText: string,
): Promise<boolean> {
  if (!this.passwordHash) {
    // The caller forgot `.select('+passwordHash')`; fail closed.
    throw new Error('passwordHash was not loaded for this document');
  }
  return bcrypt.compare(plainText, this.passwordHash);
};

UserSchema.methods.isLocked = function (this: UserDocument): boolean {
  return this.lockedUntil !== null && this.lockedUntil.getTime() > Date.now();
};

UserSchema.methods.hasRole = function (
  this: UserDocument,
  role: UserRole,
): boolean {
  return this.roles.includes(role);
};

// Belt and braces: even an explicitly loaded `select: false` field must never
// reach a JSON response.
applyDocumentSerialization(UserSchema, (_doc, ret) => {
  delete ret.passwordHash;
  delete ret.failedLoginAttempts;
  delete ret.lockedUntil;
  return ret;
});
