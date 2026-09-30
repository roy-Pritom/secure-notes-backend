import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

import { CreatePostDto, PostResponseDto } from './dto';
import { PostStatus } from './enums';
import {
  MAX_POST_EXCERPT_LENGTH,
  Post,
  type PostModel,
} from './schemas/post.schema';

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
    const status = dto.status ?? PostStatus.Published;

    const post = await this.postModel.create({
      author,
      ...dto,
      status,
      excerpt: dto.excerpt ?? deriveExcerpt(dto.body),
      // A draft has not gone out yet, so it carries no publication date.
      publishedAt: status === PostStatus.Published ? new Date() : null,
    });
    return PostResponseDto.fromEntity(post);
  }

  /**
   * Cascade for a deleted account. Served by the `{ author, isDeleted }`
   * prefix of `posts_by_author_status_created`.
   */
  async removeAllForAuthor(author: Types.ObjectId): Promise<number> {
    const result = await this.postModel
      .updateMany(
        { author, isDeleted: false },
        { $set: { isDeleted: true, deletedAt: new Date() } },
      )
      .exec();
    return result.modifiedCount;
  }
}

/** The opening of the body, cut on a word boundary where there is one. */
function deriveExcerpt(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  if (flat.length <= MAX_POST_EXCERPT_LENGTH) {
    return flat;
  }

  const cut = flat.slice(0, MAX_POST_EXCERPT_LENGTH - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > 0 ? cut.slice(0, lastSpace) : cut}…`;
}
