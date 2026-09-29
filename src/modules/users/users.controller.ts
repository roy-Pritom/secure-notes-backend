import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Types } from 'mongoose';

import { Roles } from '../../common/decorators';
import {
  PaginatedResponseDto,
  PaginationQueryDto,
} from '../../common/pagination';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { API_VERSION } from '../../utils/constant';
import {
  AdminUpdateUserDto,
  CreateUserDto,
  InterestGroupDto,
  QueryInterestsDto,
  UserPostsDto,
  UserResponseDto,
} from './dto';
import { UserRole } from './enums';
import { UsersService } from './users.service';


@ApiTags('users')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Requires the admin role' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'users', version: API_VERSION.V1 })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles(UserRole.Admin)
  @Post()
  @ApiOperation({ summary: 'Add a user' })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiConflictResponse({ description: 'Email already registered' })
  create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(dto, true);
  }

  @Roles(UserRole.Admin)
  @Get()
  @ApiOperation({ summary: 'List all users, newest first' })
  findAll(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResponseDto<UserResponseDto>> {
    return this.usersService.findAll(query);
  }

  
  @Roles(UserRole.Admin)
  @Get('interests')
  @ApiOperation({ summary: 'Users grouped by interest (aggregation)' })
  @ApiOkResponse({ type: [InterestGroupDto] })
  findInterestGroups(
    @Query() query: QueryInterestsDto,
  ): Promise<PaginatedResponseDto<InterestGroupDto>> {
    return this.usersService.findInterestGroups(query);
  }

  @Roles(UserRole.Admin)
  @Get(':id')
  @ApiOperation({ summary: 'Fetch one user' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'User does not exist' })
  findOne(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
  ): Promise<UserResponseDto> {
    return this.usersService.findOne(id);
  }

  @Roles(UserRole.Admin)
  @Patch(':id')
  @ApiOperation({ summary: 'Update a user, including roles and status' })
  @ApiOkResponse({ type: UserResponseDto })
  update(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @Body() dto: AdminUpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.update(id, dto);
  }

  @Roles(UserRole.Admin)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a user' })
  @ApiNoContentResponse({ description: 'User removed' })
  remove(@Param('id', ParseObjectIdPipe) id: Types.ObjectId): Promise<void> {
    return this.usersService.remove(id);
  }

  /** Posts are public content: any signed-in user may read them. */
  @Get(':id/posts')
  @ApiOperation({ summary: "Fetch a user's posts through a single $lookup" })
  @ApiOkResponse({ type: UserPostsDto })
  @ApiNotFoundResponse({ description: 'User does not exist' })
  findPosts(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @Query() query: PaginationQueryDto,
  ): Promise<UserPostsDto> {
    return this.usersService.findPosts(id, query);
  }
}
