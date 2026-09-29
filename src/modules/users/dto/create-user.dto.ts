import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
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

import { normalizeEmail, trimString } from '../../../common/transformers';
import { UserRole } from '../enums';

export class CreateUserDto {
  @ApiProperty({ example: 'ada@example.com', maxLength: 254 })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'email must be a valid address' })
  @MaxLength(254)
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

  @ApiProperty({ example: 'Ada', maxLength: 80 })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstName!: string;

  @ApiProperty({ example: 'Lovelace', maxLength: 80 })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  lastName!: string;

  /** Ignored for self-registration; only an admin route may honour it. */
  @ApiPropertyOptional({
    enum: UserRole,
    isArray: true,
    default: [UserRole.User],
  })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(Object.keys(UserRole).length)
  @IsEnum(UserRole, { each: true })
  @IsOptional()
  roles?: UserRole[];
}
