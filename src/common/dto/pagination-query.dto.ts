import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

import { toLowerCase } from '../transformers';

export type SortOrder = 'asc' | 'desc';

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

  @ApiPropertyOptional({
    description: 'Field to sort by',
    default: 'createdAt',
  })
  @IsString()
  // Plain field names only, so the value can never inject an operator or
  // reach into a nested internal path.
  @Matches(/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/, {
    message: 'sortBy must be a plain field name',
  })
  @IsOptional()
  sortBy: string = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @Transform(toLowerCase)
  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder: SortOrder = 'desc';

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}
