import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Types } from 'mongoose';

import {
  PaginatedResponseDto,
  PaginationService,
} from '../../common/pagination';
import { SearchQueryDto } from '../../common/search';
import { AuthenticatedUser } from '../../common/types';
import { SECURITY_CONFIG_KEY, SecurityConfig } from '../../config';
import { NotesService } from '../notes/notes.service';
import { PostsService } from '../posts/posts.service';
import { RefreshTokensService } from '../refresh-tokens/refresh-tokens.service';
import {
  AdminUpdateUserDto,
  CreateUserDto,
  InterestGroupDto,
  QueryInterestsDto,
  UpdatePasswordDto,
  UpdateUserDto,
  UserPostsDto,
  UserResponseDto,
} from './dto';
import { UserRole } from './enums';
import { UserDocument } from './schemas/user.schema';
import { UsersRepository } from './users.repository';

const DUPLICATE_EMAIL_MESSAGE = 'A user with this email already exists';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly security: SecurityConfig;
  private decoyHash?: string;

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly refreshTokensService: RefreshTokensService,
    private readonly notesService: NotesService,
    private readonly postsService: PostsService,
    private readonly pagination: PaginationService,
    configService: ConfigService,
  ) {
    this.security =
      configService.getOrThrow<SecurityConfig>(SECURITY_CONFIG_KEY);
  }

  async create(
    dto: CreateUserDto,
    allowRoleAssignment = false,
  ): Promise<UserResponseDto> {
    // Pre-check for a friendly error; the unique index is still the real
    // guarantee against the race between this check and the insert.
    if (await this.usersRepository.existsByEmail(dto.email)) {
      throw new ConflictException(DUPLICATE_EMAIL_MESSAGE);
    }

    const passwordHash = await bcrypt.hash(
      dto.password,
      this.security.bcryptSaltRounds,
    );

    try {
      const user = await this.usersRepository.create({
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        avatarUrl: dto.avatarUrl,
        bio: dto.bio,
        interests: dto.interests,
        roles: allowRoleAssignment ? dto.roles : [UserRole.User],
      });

      this.logger.log(`Created user ${user._id.toHexString()}`);
      return UserResponseDto.fromEntity(user);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException(DUPLICATE_EMAIL_MESSAGE);
      }
      throw error;
    }
  }

  async findAll(
    query: SearchQueryDto,
  ): Promise<PaginatedResponseDto<UserResponseDto>> {
    return this.pagination.toResponse(
      await this.usersRepository.findPaginated(query),
      query,
      UserResponseDto.fromEntities,
    );
  }

  async findOne(id: Types.ObjectId): Promise<UserResponseDto> {
    return UserResponseDto.fromEntity(await this.getOrThrow(id));
  }

  async update(
    id: Types.ObjectId,
    dto: UpdateUserDto | AdminUpdateUserDto,
  ): Promise<UserResponseDto> {
    const elevated = dto as AdminUpdateUserDto;
    // A role or status change must not be survived by tokens minted before it.
    const endSession =
      elevated.roles !== undefined || elevated.status !== undefined;

    const updated = await this.usersRepository.updateById(id, {
      $set: { ...dto },
    });
    if (!updated) {
      throw notFound(id);
    }

    if (endSession) {
      await this.refreshTokensService.revokeAllForUser(id);
    }
    return UserResponseDto.fromEntity(updated);
  }

  async changePassword(
    id: Types.ObjectId,
    dto: UpdatePasswordDto,
  ): Promise<void> {
    const user = await this.usersRepository.findById(id, '+passwordHash');
    if (!user) {
      throw notFound(id);
    }

    if (!(await user.verifyPassword(dto.currentPassword))) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(
      dto.newPassword,
      this.security.bcryptSaltRounds,
    );
    await this.usersRepository.updateById(id, {
      $set: { passwordHash, passwordChangedAt: new Date() },
    });
    // Rotating the password ends every session, on every device.
    await this.refreshTokensService.revokeAllForUser(id);

    this.logger.log(`Password changed for user ${id.toHexString()}`);
  }

  async remove(id: Types.ObjectId): Promise<void> {
    const deleted = await this.usersRepository.softDeleteById(id);
    if (!deleted) {
      throw notFound(id);
    }
    // MongoDB has no cascade, so everything the account owns is ended here.
    // The user row is already flagged, so a partial failure below leaves
    // content orphaned but unreachable, never an account that is still usable.
    const [, notes, posts] = await Promise.all([
      this.refreshTokensService.revokeAllForUser(id),
      this.notesService.removeAllForOwner(id),
      this.postsService.removeAllForAuthor(id),
    ]);

    this.logger.log(
      `Soft-deleted user ${id.toHexString()} with ${notes} note(s) and ${posts} post(s)`,
    );
  }

  async findInterestGroups(
    query: QueryInterestsDto,
  ): Promise<PaginatedResponseDto<InterestGroupDto>> {
    return this.pagination.toResponse(
      await this.usersRepository.groupByInterests(query),
      query,
    );
  }

  async findPosts(
    id: Types.ObjectId,
    query: SearchQueryDto,
    caller: AuthenticatedUser,
  ): Promise<UserPostsDto> {
    // Decided here, not in the UI: a draft left out of the response is the
    // only kind that cannot leak.
    const includeDrafts =
      caller.id === id.toHexString() || caller.roles.includes(UserRole.Admin);
    const result = await this.usersRepository.findWithPosts(
      id,
      query,
      includeDrafts,
    );
    if (!result) {
      throw notFound(id);
    }

    return {
      author: result.author,
      ...this.pagination.toResponse(result, query),
    };
  }

  /* ----------------------------------------------------- auth collaborators */

  findByEmailWithCredentials(email: string): Promise<UserDocument | null> {
    return this.usersRepository.findByEmail(email, true);
  }

  findActiveById(id: Types.ObjectId): Promise<UserDocument | null> {
    return this.usersRepository.findById(id);
  }

  /** Keeps a login attempt against an unknown email as slow as a real one. */
  async simulatePasswordCheck(password: string): Promise<void> {
    this.decoyHash ??= await bcrypt.hash(
      'decoy',
      this.security.bcryptSaltRounds,
    );
    await bcrypt.compare(password, this.decoyHash);
  }

  async registerFailedLogin(user: UserDocument): Promise<void> {
    const attempts = user.failedLoginAttempts + 1;
    const locked = attempts >= this.security.maxFailedLoginAttempts;

    await this.usersRepository.updateById(user._id, {
      $set: locked
        ? {
            failedLoginAttempts: 0,
            lockedUntil: new Date(Date.now() + this.security.accountLockMs),
          }
        : { failedLoginAttempts: attempts },
    });

    if (locked) {
      this.logger.warn(`Locked account ${user._id.toHexString()}`);
    }
  }

  /**
   * Stamps the login and clears the failed-attempt state. The session itself
   * lives in `refresh_tokens`, so nothing about it is recorded here.
   */
  async markLoginSucceeded(id: Types.ObjectId): Promise<void> {
    await this.usersRepository.updateById(id, {
      $set: {
        lastLoginAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  private async getOrThrow(id: Types.ObjectId): Promise<UserDocument> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw notFound(id);
    }
    return user;
  }
}

function notFound(id: Types.ObjectId): NotFoundException {
  return new NotFoundException(`User ${id.toHexString()} not found`);
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: number }).code === 11000
  );
}
