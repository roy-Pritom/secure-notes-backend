import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { HydratedDocument, Model, Types } from 'mongoose';

import { BaseSchema } from '../../../common/schemas/base.schema';
import { applyDocumentSerialization } from '../../../common/schemas/serialization';
import { User } from '../../users/schemas/user.schema';
import { PostStatus } from '../enums';

export const POST_COLLECTION = 'posts';

export const MAX_POST_TITLE_LENGTH = 160;
export const MAX_POST_BODY_LENGTH = 10_000;
export const MAX_POST_EXCERPT_LENGTH = 300;
export const MAX_POST_TAGS = 10;
export const MAX_POST_TAG_LENGTH = 30;

/** Public content: every post is readable by anyone, so there is no owner scope. */
@Schema({
  collection: POST_COLLECTION,
  timestamps: true,
  strict: 'throw',
  minimize: false,
})
export class Post extends BaseSchema {
  @ApiProperty({ example: '6650f1a2b3c4d5e6f7a8b9c0' })
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  author!: Types.ObjectId;

  @ApiProperty({
    example: 'Why endgames matter',
    maxLength: MAX_POST_TITLE_LENGTH,
  })
  @Prop({
    type: String,
    required: true,
    trim: true,
    maxlength: MAX_POST_TITLE_LENGTH,
  })
  title!: string;

  @ApiProperty({ maxLength: MAX_POST_BODY_LENGTH })
  @Prop({
    type: String,
    required: true,
    trim: true,
    maxlength: MAX_POST_BODY_LENGTH,
  })
  body!: string;

  /** Derived from `body` when the author does not write one. */
  @ApiProperty({
    example: 'A short look at king activity.',
    maxLength: MAX_POST_EXCERPT_LENGTH,
  })
  @Prop({
    type: String,
    default: '',
    trim: true,
    maxlength: MAX_POST_EXCERPT_LENGTH,
  })
  excerpt!: string;

  @ApiProperty({
    example: ['chess', 'endgame'],
    type: [String],
    maxItems: MAX_POST_TAGS,
  })
  @Prop({
    type: [String],
    default: [],
    trim: true,
    lowercase: true,
  })
  tags!: string[];

  @ApiProperty({ enum: PostStatus, default: PostStatus.Published })
  @Prop({
    type: String,
    enum: Object.values(PostStatus),
    default: PostStatus.Published,
  })
  status!: PostStatus;

  /** Stamped the moment the post first goes out; null while it is a draft. */
  @ApiProperty({ type: Date, nullable: true })
  @Prop({ type: Date, default: null })
  publishedAt!: Date | null;
}

export type PostDocument = HydratedDocument<Post>;
export type PostModel = Model<PostDocument>;

export const PostSchema = SchemaFactory.createForClass(Post);

/*
 * One index: the `$lookup` that joins a user to their live posts, newest
 * first. `author` alone would serve the join but leave the sort in memory,
 * and `isDeleted` sits between the two equality keys and the sort key so the
 * active-only filter is read from the index rather than applied after it.
 */
PostSchema.index(
  { author: 1, isDeleted: 1, createdAt: -1 },
  { name: 'posts_by_author_created' },
);

applyDocumentSerialization(PostSchema);
