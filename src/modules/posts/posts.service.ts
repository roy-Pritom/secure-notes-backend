import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

import { CreatePostDto, PostResponseDto } from './dto';
import { Post, type PostModel } from './schemas/post.schema';

/**
 * Posts exist so a user can have public content to read back. Listing them is
 * the users module's `$lookup` view, so this service only writes.
 */
@Injectable()
export class PostsService {
  constructor(@InjectModel(Post.name) private readonly postModel: PostModel) {}

  async create(
    author: Types.ObjectId,
    dto: CreatePostDto,
  ): Promise<PostResponseDto> {
    const post = await this.postModel.create({ author, ...dto });
    return PostResponseDto.fromEntity(post);
  }
}
