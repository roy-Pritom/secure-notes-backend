import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsStrongPassword,
  MaxLength,
  MinLength,
} from 'class-validator';

import {
  normalizeEmail,
  normalizeTags,
  trimString,
} from '../../../common/transformers';
import { UserRole } from '../enums';
import {
  MAX_EMAIL_LENGTH,
  MAX_INTEREST_LENGTH,
  MAX_INTERESTS,
  MAX_NAME_LENGTH,
} from '../schemas/user.schema';

export class CreateUserDto {
  @ApiProperty({ example: 'ada@example.com', maxLength: MAX_EMAIL_LENGTH })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'email must be a valid address' })
  @MaxLength(MAX_EMAIL_LENGTH)
  email!: string;

  @ApiProperty({
    example: 'C0rrect-Horse-Battery!',
    minLength: 12,
    maxLength: 72,
    description:
      'At least 12 characters with one lowercase, one uppercase, one digit and one symbol.',
  })
  @IsString()
  @MinLength(12)
  @MaxLength(72) // bcrypt only considers the first 72 bytes
  @IsStrongPassword(
    {
      minLength: 12,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 1,
    },
    {
      message:
        'password must contain lower, upper, number and symbol characters',
    },
  )
  password!: string;

  @ApiProperty({ example: 'Ada', maxLength: MAX_NAME_LENGTH })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_NAME_LENGTH)
  firstName!: string;

  @ApiProperty({ example: 'Lovelace', maxLength: MAX_NAME_LENGTH })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_NAME_LENGTH)
  lastName!: string;

  @ApiPropertyOptional({ example: ['chess', 'reading'], type: [String] })
  @Transform(normalizeTags)
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(MAX_INTERESTS)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(MAX_INTEREST_LENGTH, { each: true })
  @IsOptional()
  interests?: string[];

  /** Honoured only on the admin route; self-registration never sees it. */
  @ApiPropertyOptional({
    enum: UserRole,
    isArray: true,
    default: [UserRole.User],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(Object.keys(UserRole).length)
  @IsEnum(UserRole, { each: true })
  @IsOptional()
  roles?: UserRole[];
}
