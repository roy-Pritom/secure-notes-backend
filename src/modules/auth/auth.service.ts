import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Types } from 'mongoose';

import { RefreshTokensService } from '../refresh-tokens/refresh-tokens.service';
import { UserResponseDto } from '../users/dto';
import { UserRole, UserStatus } from '../users/enums';
import { UsersService } from '../users/users.service';
import { AuthResponseDto, LoginDto, RegisterDto } from './dto';
import { TokenService } from './token.service';
import { JwtPayload } from './types';

/** One message for every failed login: never reveal which half was wrong. */
const INVALID_CREDENTIALS = 'Invalid email or password';

/** Likewise for refresh: revoked, unknown and expired are indistinguishable. */
const SESSION_ENDED = 'Session is no longer active';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly refreshTokensService: RefreshTokensService,
    private readonly tokenService: TokenService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const user = await this.usersService.create(dto);
    return this.grant(new Types.ObjectId(user.id), user);
  }

  /**
   * Creates an administrator, for the temporary `setup-admin` route that is
   * commented out in `AuthController`. Same body as registration; the roles
   * are fixed here rather than read from it, so the route cannot be talked
   * into granting anything else.
   */
  async setupAdmin(dto: RegisterDto): Promise<AuthResponseDto> {
    const user = await this.usersService.create(
      { ...dto, roles: [UserRole.User, UserRole.Admin] },
      true,
    );

    this.logger.warn(
      `Administrator ${user.email} created via setup-admin — comment the route out again`,
    );
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

    // Existing sessions survive: a sign-in on a second device does not evict
    // the first, which is the point of a row per token.
    return this.grant(user._id, UserResponseDto.fromEntity(user));
  }

  /**
   * Rotates the pair. A refresh token is single-use, so presenting one twice
   * is either a replay or a theft, and costs the user every live session.
   */
  async refresh(refreshToken: string): Promise<AuthResponseDto> {
    let payload: JwtPayload;
    try {
      payload = await this.tokenService.verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const userId = new Types.ObjectId(payload.sub);
    const session = await this.refreshTokensService.findByToken(refreshToken);

    // Signed by us, but no row: the session was revoked in bulk and its row
    // has since aged out, or the token was never ours to begin with.
    if (!session || !session.user.equals(userId)) {
      throw new UnauthorizedException(SESSION_ENDED);
    }

    if (session.revokedAt !== null) {
      // A spent row presented again: whoever holds the successor may not be
      // the person who holds this one, so the whole family goes.
      await this.refreshTokensService.revokeAllForUser(userId);
      this.logger.warn(`Refresh token reuse detected for user ${payload.sub}`);
      throw new UnauthorizedException(SESSION_ENDED);
    }

    if (!session.isActive()) {
      throw new UnauthorizedException(SESSION_ENDED);
    }

    const user = await this.usersService.findActiveById(userId);
    if (!user || user.status === UserStatus.Suspended) {
      await this.refreshTokensService.revokeAllForUser(userId);
      throw new UnauthorizedException(SESSION_ENDED);
    }

    // Spend the row before minting its replacement. The compare-and-set means
    // two concurrent rotations of the same token cannot both succeed.
    if (!(await this.refreshTokensService.consume(session._id))) {
      await this.refreshTokensService.revokeAllForUser(userId);
      this.logger.warn(`Concurrent refresh rotation for user ${payload.sub}`);
      throw new UnauthorizedException(SESSION_ENDED);
    }

    return this.grant(userId, UserResponseDto.fromEntity(user));
  }

  /** Signs out everywhere: the access token names the user, not one session. */
  async logout(userId: Types.ObjectId): Promise<void> {
    await this.refreshTokensService.revokeAllForUser(userId);
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

    await this.refreshTokensService.issue(
      userId,
      tokens.refreshToken,
      this.tokenService.expiresAt(tokens.refreshToken),
    );
    await this.usersService.markLoginSucceeded(userId);

    return AuthResponseDto.build(tokens, user);
  }
}
