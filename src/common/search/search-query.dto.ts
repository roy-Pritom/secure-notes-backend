import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import { PaginationQueryDto } from '../pagination';
import { trimString } from '../transformers';

/** Bounds the scan a regex search costs; also keeps the pattern itself small. */
export const MAX_SEARCH_TERM_LENGTH = 100;

/** Pagination plus free-text search, for any listing that offers both. */
export class SearchQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'endgame',
    maxLength: MAX_SEARCH_TERM_LENGTH,
    description:
      'Case-insensitive substring match; the fields it covers are listed per endpoint',
  })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_SEARCH_TERM_LENGTH)
  @IsOptional()
  searchTerm?: string;
}
