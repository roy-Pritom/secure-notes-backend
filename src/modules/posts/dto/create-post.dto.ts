import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { normalizeTags, trimString } from '../../../common/transformers';
import { PostStatus } from '../enums';
import {
  MAX_POST_BODY_LENGTH,
  MAX_POST_EXCERPT_LENGTH,
  MAX_POST_TAG_LENGTH,
  MAX_POST_TAGS,
  MAX_POST_TITLE_LENGTH,
} from '../schemas/post.schema';

export class CreatePostDto {
  @ApiProperty({
    example: 'Why endgames matter',
    maxLength: MAX_POST_TITLE_LENGTH,
  })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_POST_TITLE_LENGTH)
  title!: string;

  @ApiProperty({ maxLength: MAX_POST_BODY_LENGTH })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_POST_BODY_LENGTH)
  body!: string;

  @ApiPropertyOptional({
    maxLength: MAX_POST_EXCERPT_LENGTH,
    description: 'Falls back to the opening of the body when omitted',
  })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_POST_EXCERPT_LENGTH)
  @IsOptional()
  excerpt?: string;

  @ApiPropertyOptional({
    example: ['chess', 'endgame'],
    type: [String],
    maxItems: MAX_POST_TAGS,
  })
  @Transform(normalizeTags)
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(MAX_POST_TAGS)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(MAX_POST_TAG_LENGTH, { each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ enum: PostStatus, default: PostStatus.Published })
  @IsEnum(PostStatus)
  @IsOptional()
  status?: PostStatus;
}
