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
import { SECURITY_CONFIG_KEY, SecurityConfig } from '../../config';
import {
  CreateUserDto,
  QueryUsersDto,
  UpdatePasswordDto,
  UpdateUserDto,
  UserResponseDto,
} from './dto';
import { UserRole, UserStatus } from './enums';
import { UserDocument } from './schemas/user.schema';
import { UsersRepository } from './users.repository';

const DUPLICATE_EMAIL_MESSAGE = 'A user with this email already exists';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly saltRounds: number;

  constructor(
    private readonly usersRepository: UsersRepository,
    configService: ConfigService,
  ) {
    this.saltRounds =
      configService.getOrThrow<SecurityConfig>(
        SECURITY_CONFIG_KEY,
      ).bcryptSaltRounds;
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

    const passwordHash = await bcrypt.hash(dto.password, this.saltRounds);

    try {
      const user = await this.usersRepository.create({
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        roles: allowRoleAssignment
          ? (dto.roles ?? [UserRole.User])
          : [UserRole.User],
      });

      this.logger.log(`Created user ${String(user._id)}`);
      return UserResponseDto.fromEntity(user);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException(DUPLICATE_EMAIL_MESSAGE);
      }
      throw error;
    }
  }

  async findAll(
    query: QueryUsersDto,
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
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw notFound(id);
    }
    return UserResponseDto.fromEntity(user);
  }

  async update(
    id: Types.ObjectId,
    dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    // An empty PATCH must not clear fields — `$set: {}` is a no-op update.
    const updated = await this.usersRepository.updateById(id, {
      $set: { ...dto },
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

    const matches = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!matches) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, this.saltRounds);
    await this.usersRepository.updateById(id, {
      // Rotating the password ends every other session.
      $set: { passwordHash, refreshTokenHash: null },
    });

    this.logger.log(`Password changed for user ${id.toHexString()}`);
  }

  async setStatus(
    id: Types.ObjectId,
    status: UserStatus,
  ): Promise<UserResponseDto> {
    const updated = await this.usersRepository.updateById(id, {
      $set: { status },
    });
    if (!updated) {
      throw notFound(id);
    }
    return UserResponseDto.fromEntity(updated);
  }

  async remove(id: Types.ObjectId): Promise<void> {
    const deleted = await this.usersRepository.softDeleteById(id);
    if (!deleted) {
      throw notFound(id);
    }
    this.logger.log(`Soft-deleted user ${id.toHexString()}`);
  }

  /** For the auth module only: returns the document with credentials loaded. */
  async findByEmailWithCredentials(
    email: string,
  ): Promise<UserDocument | null> {
    return this.usersRepository.findByEmail(email, true);
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
