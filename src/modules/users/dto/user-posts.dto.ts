import { ApiProperty } from '@nestjs/swagger';

import { PaginationMetaDto } from '../../../common/pagination';
import { PostStatus } from '../../posts/enums';
import { InterestMemberDto } from './interest-group.dto';

export class AuthoredPostDto {
  @ApiProperty({ example: '6650f1a2b3c4d5e6f7a8b9c0' }) id!: string;
  @ApiProperty({ example: 'Why endgames matter' }) title!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ example: 'A short look at king activity.' }) excerpt!: string;
  @ApiProperty({ example: ['chess'], type: [String] }) tags!: string[];
  @ApiProperty({ enum: PostStatus }) status!: PostStatus;
  @ApiProperty({ type: Date, nullable: true }) publishedAt!: Date | null;
  @ApiProperty({ type: Date }) createdAt!: Date;
}

/** Result of the single `$lookup` pipeline: an author and a page of their posts. */
export class UserPostsDto {
  @ApiProperty({ type: InterestMemberDto }) author!: InterestMemberDto;
  @ApiProperty({ type: [AuthoredPostDto] }) items!: AuthoredPostDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}
