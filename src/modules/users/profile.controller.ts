import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Types } from 'mongoose';

import { CurrentUserId } from '../../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { API_VERSION } from '../../utils/constant';
import { UpdatePasswordDto, UpdateUserDto, UserResponseDto } from './dto';
import { UsersService } from './users.service';

/** The caller's own account. The id always comes from the token, never the URL. */
@ApiTags('profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'profile', version: API_VERSION.V1 })
export class ProfileController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Fetch my profile' })
  @ApiOkResponse({ type: UserResponseDto })
  findMe(@CurrentUserId() userId: Types.ObjectId): Promise<UserResponseDto> {
    return this.usersService.findOne(userId);
  }

  @Patch()
  @ApiOperation({ summary: 'Update my name or interests' })
  @ApiOkResponse({ type: UserResponseDto })
  update(
    @CurrentUserId() userId: Types.ObjectId,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.update(userId, dto);
  }

  @Patch('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Change my password' })
  @ApiNoContentResponse({
    description: 'Password updated, other sessions ended',
  })
  @ApiUnauthorizedResponse({ description: 'Current password is incorrect' })
  changePassword(
    @CurrentUserId() userId: Types.ObjectId,
    @Body() dto: UpdatePasswordDto,
  ): Promise<void> {
    return this.usersService.changePassword(userId, dto);
  }
}
