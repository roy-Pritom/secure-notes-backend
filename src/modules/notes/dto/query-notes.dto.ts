import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/pagination';
import { toBoolean, toLowerCase } from '../../../common/transformers';
import { MAX_NOTE_TAG_LENGTH } from '../schemas/note.schema';

/** The filters a note listing accepts, on top of page/limit/sortOrder. */
export class QueryNotesDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'chess',
    description: 'Return only notes carrying this tag',
  })
  @Transform(toLowerCase)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_NOTE_TAG_LENGTH)
  @IsOptional()
  tag?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Archived notes are hidden unless this is set',
  })
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  archived: boolean = false;

  @ApiPropertyOptional({
    description: 'Return only pinned notes when true, only unpinned when false',
  })
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  pinned?: boolean;
}
