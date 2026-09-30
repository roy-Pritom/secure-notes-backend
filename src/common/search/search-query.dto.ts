import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import { PaginationQueryDto } from '../pagination';
import { trimString } from '../transformers';

/** Keeps the term, and so the number of prefix clauses it becomes, small. */
export const MAX_SEARCH_TERM_LENGTH = 100;

/** Pagination plus free-text search, for any listing that offers both. */
export class SearchQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'endgame',
    maxLength: MAX_SEARCH_TERM_LENGTH,
    description:
      'Case-insensitive match on whole words or word starts ("endgam" finds "endgames"); ' +
      'every word must match. The fields it covers are listed per endpoint',
  })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_SEARCH_TERM_LENGTH)
  @IsOptional()
  searchTerm?: string;
}
