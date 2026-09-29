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
 * Indexes — one per access path, nothing speculative.
 *
 * 1. own_notes_by_created   `GET /notes`, a user's own listing
 * 2. all_notes_by_created   `GET /notes/all`, the admin listing
 * 3. own_notes_by_tag       the same two listings narrowed by `?tag=`
 * 4. all_notes_by_tag
 *
 * Every listing filters `isDeleted` and `isArchived` and orders pinned notes
 * first, so those keys lead in each of them. Reads of a single note go through
 * `_id`, which MongoDB already indexes.
 */

NoteSchema.index(
  { owner: 1, isDeleted: 1, isArchived: 1, isPinned: -1, createdAt: -1 },
  { name: 'own_notes_by_created' },
);

NoteSchema.index(
  { isDeleted: 1, isArchived: 1, isPinned: -1, createdAt: -1 },
  { name: 'all_notes_by_created' },
);

/*
 * The `?tag=` variants. Multikey on `tags`, so it ends the key list: a
 * multikey field cannot be followed by a sort key the index is expected to
 * serve, and the pinned-first ordering is applied to what these return. Every
 * equality the filter carries still precedes it, so the scan is bounded to one
 * owner's live, unarchived notes rather than narrowed afterwards.
 */
NoteSchema.index(
  { owner: 1, isDeleted: 1, isArchived: 1, tags: 1 },
  { name: 'own_notes_by_tag' },
);

NoteSchema.index(
  { isDeleted: 1, isArchived: 1, tags: 1 },
  { name: 'all_notes_by_tag' },
);

applyDocumentSerialization(NoteSchema);
