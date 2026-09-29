import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

import { toLowerCase } from '../transformers';

export type SortOrder = 'asc' | 'desc';

/**
 * Every list endpoint sorts by `createdAt`, which is the trailing key of each
 * listing index. There is deliberately no `sortBy`: an arbitrary sort field
 * would need an index nobody asked for, or an in-memory sort.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100) // an unbounded limit is a trivial DoS vector
  @IsOptional()
  limit: number = 20;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @Transform(toLowerCase)
  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder: SortOrder = 'desc';

  get skip(): number {
    return (this.page - 1) * this.limit;
  }

  /** `-1`/`1` for `createdAt`, matching the direction stored in the index. */
  get createdAtSort(): 1 | -1 {
    return this.sortOrder === 'asc' ? 1 : -1;
  }
}
