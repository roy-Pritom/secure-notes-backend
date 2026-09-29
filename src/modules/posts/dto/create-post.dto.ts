import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { trimString } from '../../../common/transformers';
import {
  MAX_POST_BODY_LENGTH,
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
}
