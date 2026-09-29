import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { toLowerCase } from '../../../common/transformers';
import { MAX_INTEREST_LENGTH } from '../schemas/user.schema';

export class QueryInterestsDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'chess',
    description: 'Return only this interest group',
  })
  @Transform(toLowerCase)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_INTEREST_LENGTH)
  @IsOptional()
  interest?: string;
}
