import { OmitType, PartialType } from '@nestjs/swagger';

import { CreateUserDto } from './create-user.dto';

/**
 * Profile fields only. Passwords go through `UpdatePasswordDto` so the current
 * one can be required; email changes go through their own verified flow.
 */
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password', 'email'] as const),
) {}
