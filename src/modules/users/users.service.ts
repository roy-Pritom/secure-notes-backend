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

import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { hashToken } from '../../common/utils';
import { SECURITY_CONFIG_KEY, SecurityConfig } from '../../config';
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
    query: PaginationQueryDto,
  ): Promise<PaginatedResponseDto<UserResponseDto>> {
    const { items, total } = await this.usersRepository.findPaginated(query);
    return PaginatedResponseDto.build(
      UserResponseDto.fromEntities(items),
      total,
      query.page,
      query.limit,
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
      $set: { ...dto, ...(endSession ? { refreshTokenHash: null } : {}) },
    });
    if (!updated) {
      throw notFound(id);
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
      // Rotating the password ends every other session.
      $set: { passwordHash, refreshTokenHash: null },
    });

    this.logger.log(`Password changed for user ${id.toHexString()}`);
  }

  async remove(id: Types.ObjectId): Promise<void> {
    const deleted = await this.usersRepository.softDeleteById(id);
    if (!deleted) {
      throw notFound(id);
    }
    this.logger.log(`Soft-deleted user ${id.toHexString()}`);
  }

  /** Scenario 1 — the grouped-by-interest view. */
  async findInterestGroups(
    query: QueryInterestsDto,
  ): Promise<PaginatedResponseDto<InterestGroupDto>> {
    const { items, total } = await this.usersRepository.groupByInterests(query);
    return PaginatedResponseDto.build(items, total, query.page, query.limit);
  }

  /** Scenario 2 — a user's posts, joined in one pipeline. */
  async findPosts(
    id: Types.ObjectId,
    query: PaginationQueryDto,
  ): Promise<UserPostsDto> {
    const result = await this.usersRepository.findWithPosts(id, query);
    if (!result) {
      throw notFound(id);
    }

    const page = PaginatedResponseDto.build(
      result.items,
      result.total,
      query.page,
      query.limit,
    );
    return { author: result.author, ...page };
  }

  /* ----------------------------------------------------- auth collaborators */

  findByEmailWithCredentials(email: string): Promise<UserDocument | null> {
    return this.usersRepository.findByEmail(email, true);
  }

  findWithActiveSession(id: Types.ObjectId): Promise<UserDocument | null> {
    return this.usersRepository.findById(id, '+refreshTokenHash');
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

  /** Stores the refresh token digest and clears the failed-login state. */
  async startSession(id: Types.ObjectId, refreshToken: string): Promise<void> {
    await this.usersRepository.updateById(id, {
      $set: {
        refreshTokenHash: hashToken(refreshToken),
        lastLoginAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  async clearSession(id: Types.ObjectId): Promise<void> {
    await this.usersRepository.updateById(id, {
      $set: { refreshTokenHash: null },
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
