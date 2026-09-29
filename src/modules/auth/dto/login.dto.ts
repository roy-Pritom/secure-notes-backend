import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

import { normalizeEmail } from '../../../common/transformers';

export class LoginDto {
  @ApiProperty({ example: 'ada@example.com' })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'C0rrect-Horse-Battery!' })
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password!: string;
}
