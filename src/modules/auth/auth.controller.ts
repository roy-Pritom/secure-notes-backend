import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Types } from 'mongoose';

import { CurrentUserId, Public } from '../../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { API_VERSION } from '../../utils/constant';
import { AuthService } from './auth.service';
import { AuthResponseDto, LoginDto, RefreshTokenDto, RegisterDto } from './dto';

/** Credential endpoints are rate limited well below the global ceiling. */
const CREDENTIAL_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('auth')
// Guarded like every other controller; the credential routes below opt out
// individually with `@Public()` rather than the class going unguarded.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'auth', version: API_VERSION.V1 })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle(CREDENTIAL_THROTTLE)
  @Post('register')
  @ApiOperation({ summary: 'Register an account and sign in' })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiConflictResponse({ description: 'Email already registered' })
  register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  // @Public()
  // @Throttle(CREDENTIAL_THROTTLE)
  // @Post('setup-admin')
  // @ApiOperation({ summary: 'Create the first administrator (temporary)' })
  // @ApiCreatedResponse({ type: AuthResponseDto })
  // setupAdmin(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
  //   return this.authService.setupAdmin(dto);
  // }

  @Public()
  @Throttle(CREDENTIAL_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange credentials for a token pair' })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Public()
  @Throttle(CREDENTIAL_THROTTLE)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate an expiring token pair' })
  @ApiOkResponse({ type: AuthResponseDto })
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthResponseDto> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke every session for the caller' })
  @ApiNoContentResponse({ description: 'All sessions ended' })
  logout(@CurrentUserId() userId: Types.ObjectId): Promise<void> {
    return this.authService.logout(userId);
  }
}
