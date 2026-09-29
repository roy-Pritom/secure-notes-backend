import { OmitType } from '@nestjs/swagger';

import { CreateUserDto } from '../../users/dto';

/** Self-registration can never pick its own roles; the server assigns `user`. */
export class RegisterDto extends OmitType(CreateUserDto, ['roles'] as const) {}
