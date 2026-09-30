import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { HydratedDocument, Model, Types } from 'mongoose';

import { BaseSchema } from '../../../common/schemas/base.schema';
import { applyDocumentSerialization } from '../../../common/schemas/serialization';
import { User } from '../../users/schemas/user.schema';
import { NoteColor } from '../enums';

export const NOTE_COLLECTION = 'notes';

export const MAX_NOTE_TITLE_LENGTH = 160;
export const MAX_NOTE_CONTENT_LENGTH = 20_000;
export const MAX_NOTE_TAGS = 10;
export const MAX_NOTE_TAG_LENGTH = 30;

@Schema({
  collection: NOTE_COLLECTION,
  timestamps: true,
  optimisticConcurrency: true,
  strict: 'throw',
  minimize: false,
})
export class Note extends BaseSchema {
  @ApiProperty({ example: '6650f1a2b3c4d5e6f7a8b9c0' })
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  owner!: Types.ObjectId;

  @ApiProperty({
    example: 'Opening repertoire',
    maxLength: MAX_NOTE_TITLE_LENGTH,
  })
  @Prop({
    type: String,
    required: true,
    trim: true,
    maxlength: MAX_NOTE_TITLE_LENGTH,
  })
  title!: string;

  @ApiProperty({ maxLength: MAX_NOTE_CONTENT_LENGTH })
  @Prop({
    type: String,
    required: true,
    trim: true,
    maxlength: MAX_NOTE_CONTENT_LENGTH,
  })
  content!: string;

  /** Stored lowercase and trimmed, so `?tag=` is an exact equality match. */
  @ApiProperty({
    example: ['chess', 'openings'],
    type: [String],
    maxItems: MAX_NOTE_TAGS,
  })
  @Prop({
    type: [String],
    default: [],
    trim: true,
    lowercase: true,
    maxlength: MAX_NOTE_TAG_LENGTH,
  })
  tags!: string[];

  @ApiProperty({ example: false, default: false })
  @Prop({ type: Boolean, default: false })
  isPinned!: boolean;

  @ApiProperty({ example: false, default: false })
  @Prop({ type: Boolean, default: false })
  isArchived!: boolean;

  @ApiProperty({ enum: NoteColor, default: NoteColor.Default })
  @Prop({
    type: String,
    enum: Object.values(NoteColor),
    default: NoteColor.Default,
  })
  color!: NoteColor;
}

export type NoteDocument = HydratedDocument<Note>;
export type NoteModel = Model<NoteDocument>;

export const NoteSchema = SchemaFactory.createForClass(Note);

/*
 * One index per listing: equality keys lead and the sort keys close, so a page
 * comes back ordered with no in-memory sort. Single notes are read by `_id`.
 *
 * `?tag=` gets no index of its own — `tags` is multikey and must end the key
 * list, which turns the pinned-first sort into a blocking SORT that cannot
 * stop early on a paged query. Streaming these two in order measured faster.
 */

NoteSchema.index(
  { owner: 1, isDeleted: 1, isArchived: 1, isPinned: -1, createdAt: -1 },
  { name: 'own_notes_by_created' },
);

NoteSchema.index(
  { isDeleted: 1, isArchived: 1, isPinned: -1, createdAt: -1 },
  { name: 'all_notes_by_created' },
);

applyDocumentSerialization(NoteSchema);
