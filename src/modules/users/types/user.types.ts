import { FilterQuery } from 'mongoose';

import { AuthoredPostDto } from '../dto/user-posts.dto';
import { InterestGroupDto, InterestMemberDto } from '../dto/interest-group.dto';
import { User } from '../schemas/user.schema';

/** Fields the service is allowed to write when creating a user. */
export interface CreateUserData {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  interests?: string[];
  roles?: User['roles'];
}

export type UserFilter = FilterQuery<User>;

/** Shape returned by a `$facet` tail: one page plus the unpaged total. */
export interface AggregatedPage<T> {
  items: T[];
  total: number;
}

export type InterestGroupsResult = AggregatedPage<InterestGroupDto>;

export interface UserPostsResult extends AggregatedPage<AuthoredPostDto> {
  author: InterestMemberDto;
}
