import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

import { UserRole, UserStatus } from '../enums';
import { User, UserDocument } from '../schemas/user.schema';

type UserSource = UserDocument | (User & { _id: unknown });

/**
 * The only shape controllers return, so a new schema field can never leak by
 * accident — it has to be added here deliberately.
 */
@Exclude()
export class UserResponseDto {
  @Expose()
  @ApiProperty({ example: '6650f1a2b3c4d5e6f7a8b9c0' })
  id!: string;

  @Expose()
  @ApiProperty({ example: 'ada@example.com' })
  email!: string;

  @Expose()
  @ApiProperty({ example: 'Ada' })
  firstName!: string;

  @Expose()
  @ApiProperty({ example: 'Lovelace' })
  lastName!: string;

  @Expose()
  @ApiProperty({ example: 'Ada Lovelace' })
  fullName!: string;

  @Expose()
  @ApiProperty({ enum: UserRole, isArray: true })
  roles!: UserRole[];

  @Expose()
  @ApiProperty({ enum: UserStatus })
  status!: UserStatus;

  @Expose()
  @ApiProperty({ example: ['chess', 'reading'], type: [String] })
  interests!: string[];

  @Expose()
  @Type(() => Date)
  @ApiProperty({ type: Date, nullable: true })
  lastLoginAt!: Date | null;

  @Expose()
  @Type(() => Date)
  @ApiProperty({ type: Date })
  createdAt!: Date;

  @Expose()
  @Type(() => Date)
  @ApiProperty({ type: Date })
  updatedAt!: Date;

  static fromEntity(user: UserSource): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = String(user._id);
    dto.email = user.email;
    dto.firstName = user.firstName;
    dto.lastName = user.lastName;
    dto.fullName = `${user.firstName} ${user.lastName}`.trim();
    dto.roles = user.roles;
    dto.status = user.status;
    dto.interests = user.interests;
    dto.lastLoginAt = user.lastLoginAt;
    dto.createdAt = user.createdAt;
    dto.updatedAt = user.updatedAt;
    return dto;
  }

  static fromEntities(users: UserSource[]): UserResponseDto[] {
    return users.map((user) => UserResponseDto.fromEntity(user));
  }
}
