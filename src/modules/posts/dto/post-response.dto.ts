import { ApiProperty } from '@nestjs/swagger';

import { PostStatus } from '../enums';
import { Post, PostDocument } from '../schemas/post.schema';

type PostSource = PostDocument | (Post & { _id: unknown });

export class PostResponseDto {
  @ApiProperty({ example: '6650f1a2b3c4d5e6f7a8b9c0' }) id!: string;
  @ApiProperty({ example: '6650f1a2b3c4d5e6f7a8b9c0' }) author!: string;
  @ApiProperty({ example: 'Why endgames matter' }) title!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ example: 'A short look at king activity.' }) excerpt!: string;
  @ApiProperty({ example: ['chess'], type: [String] }) tags!: string[];
  @ApiProperty({ enum: PostStatus }) status!: PostStatus;
  @ApiProperty({ type: Date, nullable: true }) publishedAt!: Date | null;
  @ApiProperty({ type: Date }) createdAt!: Date;

  static fromEntity(post: PostSource): PostResponseDto {
    return {
      id: String(post._id),
      author: String(post.author),
      title: post.title,
      body: post.body,
      excerpt: post.excerpt,
      tags: post.tags,
      status: post.status,
      publishedAt: post.publishedAt,
      createdAt: post.createdAt,
    };
  }
}
