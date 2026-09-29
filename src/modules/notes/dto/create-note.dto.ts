import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { trimString } from '../../../common/transformers';
import {
  MAX_NOTE_CONTENT_LENGTH,
  MAX_NOTE_TITLE_LENGTH,
} from '../schemas/note.schema';

export class CreateNoteDto {
  @ApiProperty({
    example: 'Opening repertoire',
    maxLength: MAX_NOTE_TITLE_LENGTH,
  })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_NOTE_TITLE_LENGTH)
  title!: string;

  @ApiProperty({ maxLength: MAX_NOTE_CONTENT_LENGTH })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_NOTE_CONTENT_LENGTH)
  content!: string;
}
