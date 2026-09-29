import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { HydratedDocument, Model, Types } from 'mongoose';

import { BaseSchema } from '../../../common/schemas/base.schema';
import { applyDocumentSerialization } from '../../../common/schemas/serialization';
import { User } from '../../users/schemas/user.schema';

export const NOTE_COLLECTION = 'notes';

export const MAX_NOTE_TITLE_LENGTH = 160;
export const MAX_NOTE_CONTENT_LENGTH = 20_000;

@Schema({
  collection: NOTE_COLLECTION,
  timestamps: true,
  optimisticConcurrency: true,
  strict: 'throw',
  minimize: false,
})
export class Note extends BaseSchema {
  /** Set from the access token, never from the request body. */
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
}

export type NoteDocument = HydratedDocument<Note>;
export type NoteModel = Model<NoteDocument>;

export const NoteSchema = SchemaFactory.createForClass(Note);

/*
 * Two listings, two indexes:
 *
 * 1. own_notes_by_created    a user paging through their own notes
 * 2. all_notes_by_created    an admin paging through everyone's notes
 *
 * The second is not a prefix of the first — with `owner` between the equality
 * key and the sort key, an unfiltered admin listing could not walk index 1 in
 * `createdAt` order. Reading a single note goes through `_id`.
 */
NoteSchema.index(
  { owner: 1, isDeleted: 1, createdAt: -1 },
  { name: 'own_notes_by_created' },
);

NoteSchema.index(
  { isDeleted: 1, createdAt: -1 },
  { name: 'all_notes_by_created' },
);

applyDocumentSerialization(NoteSchema);
