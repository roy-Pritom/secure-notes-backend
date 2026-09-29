import { Body, Controller, Post as HttpPost, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Types } from 'mongoose';

import { CurrentUserId } from '../../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { API_VERSION } from '../../utils/constant';
import { CreatePostDto, PostResponseDto } from './dto';
import { PostsService } from './posts.service';

@ApiTags('posts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'posts', version: API_VERSION.V1 })
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @HttpPost()
  @ApiOperation({ summary: 'Publish a post' })
  @ApiCreatedResponse({ type: PostResponseDto })
  create(
    @CurrentUserId() userId: Types.ObjectId,
    @Body() dto: CreatePostDto,
  ): Promise<PostResponseDto> {
    return this.postsService.create(userId, dto);
  }
}
