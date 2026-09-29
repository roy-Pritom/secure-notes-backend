import { ApiProperty } from '@nestjs/swagger';

import { PaginatedResult, PaginationMeta } from '../types';

export class PaginationMetaDto implements PaginationMeta {
  @ApiProperty({ example: 137 }) total!: number;
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 20 }) limit!: number;
  @ApiProperty({ example: 7 }) totalPages!: number;
  @ApiProperty({ example: true }) hasNextPage!: boolean;
  @ApiProperty({ example: false }) hasPreviousPage!: boolean;
}

export class PaginatedResponseDto<T> implements PaginatedResult<T> {
  items!: T[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;

  static build<T>(
    items: T[],
    total: number,
    page: number,
    limit: number,
  ): PaginatedResponseDto<T> {
    const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }
}
