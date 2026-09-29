import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { trimString } from '../../../common/transformers';
import { UserRole, UserStatus } from '../enums';

const SORTABLE_FIELDS = [
  'createdAt',
  'updatedAt',
  'email',
  'lastName',
  'lastLoginAt',
] as const;

export type UserSortField = (typeof SORTABLE_FIELDS)[number];

export class QueryUsersDto extends PaginationQueryDto {
  /** Narrowed to indexed fields, keeping arbitrary paths out of `.sort()`. */
  @ApiPropertyOptional({ enum: SORTABLE_FIELDS, default: 'createdAt' })
  @IsIn(SORTABLE_FIELDS)
  @IsOptional()
  override sortBy: UserSortField = 'createdAt';

  @ApiPropertyOptional({
    description: 'Case-insensitive match on name or email',
  })
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsEnum(UserStatus)
  @IsOptional()
  status?: UserStatus;

  @ApiPropertyOptional({ enum: UserRole })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;
}
