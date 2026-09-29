import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { HydratedDocument, Model, Types } from 'mongoose';

import { TimestampedSchema } from '../../../common/schemas/base.schema';
import { applyDocumentSerialization } from '../../../common/schemas/serialization';
import { User } from '../../users/schemas/user.schema';

export const POST_COLLECTION = 'posts';

export const MAX_POST_TITLE_LENGTH = 160;
export const MAX_POST_BODY_LENGTH = 10_000;

/** Public content: every post is readable by anyone, so there is no owner scope. */
@Schema({
  collection: POST_COLLECTION,
  timestamps: true,
  strict: 'throw',
  minimize: false,
})
export class Post extends TimestampedSchema {
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
}

export type PostDocument = HydratedDocument<Post>;
export type PostModel = Model<PostDocument>;

export const PostSchema = SchemaFactory.createForClass(Post);

/*
 * One index: the `$lookup` that joins a user to their posts, newest first.
 * `author` alone would serve the join but leave the sort in memory.
 */
PostSchema.index(
  { author: 1, createdAt: -1 },
  { name: 'posts_by_author_created' },
);

applyDocumentSerialization(PostSchema);
