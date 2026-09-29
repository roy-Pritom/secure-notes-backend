import { ApiProperty } from '@nestjs/swagger';

import { Note, NoteDocument } from '../schemas/note.schema';

type NoteSource = NoteDocument | (Note & { _id: unknown });

/** The only shape the notes routes return. */
export class NoteResponseDto {
  @ApiProperty({ example: '6650f1a2b3c4d5e6f7a8b9c0' }) id!: string;
  @ApiProperty({ example: '6650f1a2b3c4d5e6f7a8b9c0' }) owner!: string;
  @ApiProperty({ example: 'Opening repertoire' }) title!: string;
  @ApiProperty() content!: string;
  @ApiProperty({ type: Date }) createdAt!: Date;
  @ApiProperty({ type: Date }) updatedAt!: Date;

  static fromEntity(note: NoteSource): NoteResponseDto {
    return {
      id: String(note._id),
      owner: String(note.owner),
      title: note.title,
      content: note.content,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    };
  }

  static fromEntities(notes: NoteSource[]): NoteResponseDto[] {
    return notes.map((note) => NoteResponseDto.fromEntity(note));
  }
}
