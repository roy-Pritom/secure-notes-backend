import { ApiProperty } from '@nestjs/swagger';

import { NoteColor } from '../enums';
import { Note, NoteDocument } from '../schemas/note.schema';

type NoteSource = NoteDocument | (Note & { _id: unknown });

/** The only shape the notes routes return. */
export class NoteResponseDto {
  @ApiProperty({ example: '6650f1a2b3c4d5e6f7a8b9c0' }) id!: string;
  @ApiProperty({ example: '6650f1a2b3c4d5e6f7a8b9c0' }) owner!: string;
  @ApiProperty({ example: 'Opening repertoire' }) title!: string;
  @ApiProperty() content!: string;
  @ApiProperty({ example: ['chess'], type: [String] }) tags!: string[];
  @ApiProperty({ example: false }) isPinned!: boolean;
  @ApiProperty({ example: false }) isArchived!: boolean;
  @ApiProperty({ enum: NoteColor }) color!: NoteColor;
  @ApiProperty({ type: Date }) createdAt!: Date;
  @ApiProperty({ type: Date }) updatedAt!: Date;

  static fromEntity(note: NoteSource): NoteResponseDto {
    return {
      id: String(note._id),
      owner: String(note.owner),
      title: note.title,
      content: note.content,
      tags: note.tags,
      isPinned: note.isPinned,
      isArchived: note.isArchived,
      color: note.color,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    };
  }

  /** `this: void` so it can be passed straight to `PaginationService`. */
  static fromEntities(this: void, notes: NoteSource[]): NoteResponseDto[] {
    return notes.map((note) => NoteResponseDto.fromEntity(note));
  }
}
