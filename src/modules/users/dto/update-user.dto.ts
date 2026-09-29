import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

import { UserStatus } from '../enums';
import { CreateUserDto } from './create-user.dto';

/**
 * Profile fields a user may change on their own account. Passwords go through
 * `UpdatePasswordDto`, and email changes are not self-service.
 */
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password', 'email', 'roles'] as const),
) {}

/** Everything above, plus the fields only an administrator may set. */
export class AdminUpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password', 'email'] as const),
) {
  @ApiPropertyOptional({ enum: UserStatus })
  @IsEnum(UserStatus)
  @IsOptional()
  status?: UserStatus;
}
