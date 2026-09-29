import { FilterQuery } from 'mongoose';

import { PagedResult } from '../../../common/pagination';

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

// A `$facet` tail returns the same shape a paged `find()` does, so it reuses
// `PagedResult` rather than declaring a second name for it.
export type InterestGroupsResult = PagedResult<InterestGroupDto>;

export interface UserPostsResult extends PagedResult<AuthoredPostDto> {
  author: InterestMemberDto;
}
