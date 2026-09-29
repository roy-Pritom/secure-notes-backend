import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { normalizeTags, trimString } from '../../../common/transformers';
import { NoteColor } from '../enums';
import {
  MAX_NOTE_CONTENT_LENGTH,
  MAX_NOTE_TAG_LENGTH,
  MAX_NOTE_TAGS,
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

  @ApiPropertyOptional({
    example: ['chess', 'openings'],
    type: [String],
    maxItems: MAX_NOTE_TAGS,
  })
  @Transform(normalizeTags)
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(MAX_NOTE_TAGS)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(MAX_NOTE_TAG_LENGTH, { each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  isPinned?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  isArchived?: boolean;

  @ApiPropertyOptional({ enum: NoteColor, default: NoteColor.Default })
  @IsEnum(NoteColor)
  @IsOptional()
  color?: NoteColor;
}
