import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsStrongPassword,
  MaxLength,
  MinLength,
} from 'class-validator';

import { IsDifferentFrom } from '../../../common/validators';

export class UpdatePasswordDto {
  @ApiProperty({ description: 'The password currently on the account' })
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  currentPassword!: string;

  @ApiProperty({ minLength: 12, maxLength: 72 })
  @IsString()
  @MinLength(12)
  @MaxLength(72)
  @IsStrongPassword({
    minLength: 12,
    minLowercase: 1,
    minUppercase: 1,
    minNumbers: 1,
    minSymbols: 1,
  })
  @IsDifferentFrom('currentPassword', {
    message: 'newPassword must be different from currentPassword',
  })
  newPassword!: string;
}
