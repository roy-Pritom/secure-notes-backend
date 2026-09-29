import { ApiProperty } from '@nestjs/swagger';

import { UserResponseDto } from '../../users/dto';
import { TokenPair } from '../types';

export class AuthResponseDto {
  @ApiProperty({ example: 'Bearer' })
  tokenType = 'Bearer';

  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;

  static build(tokens: TokenPair, user: UserResponseDto): AuthResponseDto {
    return { tokenType: 'Bearer', ...tokens, user };
  }
}
