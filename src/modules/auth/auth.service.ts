import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Types } from 'mongoose';

import { tokenMatches } from '../../common/utils';
import { UserResponseDto } from '../users/dto';
import { UserStatus } from '../users/enums';
import { UsersService } from '../users/users.service';
import { AuthResponseDto, LoginDto, RegisterDto } from './dto';
import { TokenService } from './token.service';
import { JwtPayload } from './types';

/** One message for every failed login: never reveal which half was wrong. */
const INVALID_CREDENTIALS = 'Invalid email or password';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const user = await this.usersService.create(dto);
    return this.grant(new Types.ObjectId(user.id), user);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.usersService.findByEmailWithCredentials(dto.email);

    if (!user) {
      // Hash anyway so a missing account is not measurably faster than a
      // wrong password.
      await this.usersService.simulatePasswordCheck(dto.password);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (user.isLocked()) {
      throw new ForbiddenException(
        'Account temporarily locked after repeated failed logins',
      );
    }

    if (!(await user.verifyPassword(dto.password))) {
      await this.usersService.registerFailedLogin(user);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (user.status === UserStatus.Suspended) {
      throw new ForbiddenException('Account is suspended');
    }

    return this.grant(user._id, UserResponseDto.fromEntity(user));
  }

  /** Rotates the pair: a refresh token is single-use, so a replay is detectable. */
  async refresh(refreshToken: string): Promise<AuthResponseDto> {
    let payload: JwtPayload;
    try {
      payload = await this.tokenService.verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const userId = new Types.ObjectId(payload.sub);
    const user = await this.usersService.findWithActiveSession(userId);

    if (!user?.refreshTokenHash) {
      throw new UnauthorizedException('Session is no longer active');
    }

    if (!tokenMatches(refreshToken, user.refreshTokenHash)) {
      // A token that verified but is not the stored one was replayed or
      // stolen; drop the session entirely.
      await this.usersService.clearSession(userId);
      this.logger.warn(`Refresh token reuse detected for user ${payload.sub}`);
      throw new UnauthorizedException('Session is no longer active');
    }

    return this.grant(userId, UserResponseDto.fromEntity(user));
  }

  async logout(userId: Types.ObjectId): Promise<void> {
    await this.usersService.clearSession(userId);
  }

  private async grant(
    userId: Types.ObjectId,
    user: UserResponseDto,
  ): Promise<AuthResponseDto> {
    const tokens = await this.tokenService.issuePair({
      sub: user.id,
      email: user.email,
      roles: user.roles,
    });

    await this.usersService.startSession(userId, tokens.refreshToken);
    return AuthResponseDto.build(tokens, user);
  }
}
