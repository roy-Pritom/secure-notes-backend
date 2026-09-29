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
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Types } from 'mongoose';

import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { API_VERSION } from '../../utils/constant';
import {
  CreateUserDto,
  QueryUsersDto,
  UpdatePasswordDto,
  UpdateUserDto,
  UserResponseDto,
} from './dto';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller({ path: 'users', version: API_VERSION.V1 })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Register a user' })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiConflictResponse({ description: 'Email already registered' })
  create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    // Role assignment stays off: self-registration can never elevate itself.
    return this.usersService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List users (paginated, filterable)' })
  findAll(
    @Query() query: QueryUsersDto,
  ): Promise<PaginatedResponseDto<UserResponseDto>> {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch one user' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'User does not exist' })
  findOne(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
  ): Promise<UserResponseDto> {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user profile' })
  @ApiOkResponse({ type: UserResponseDto })
  update(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.update(id, dto);
  }

  @Patch(':id/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Change a password' })
  @ApiNoContentResponse({ description: 'Password updated' })
  changePassword(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @Body() dto: UpdatePasswordDto,
  ): Promise<void> {
    return this.usersService.changePassword(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a user' })
  @ApiNoContentResponse({ description: 'User removed' })
  remove(@Param('id', ParseObjectIdPipe) id: Types.ObjectId): Promise<void> {
    return this.usersService.remove(id);
  }
}
