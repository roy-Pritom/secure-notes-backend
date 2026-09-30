import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ProjectionType, QueryOptions, Types, UpdateQuery } from 'mongoose';

import { PagedResult, PaginationService } from '../../common/pagination';
import { SearchQueryDto, tokenSearchFilter } from '../../common/search';
import { interestGroupsPipeline, userPostsPipeline } from './aggregations';
import { QueryInterestsDto } from './dto';
import {
  User,
  type UserDocument,
  type UserModel,
  USERS_SEARCH_INDEX,
} from './schemas/user.schema';
import {
  CreateUserData,
  InterestGroupsResult,
  UserFilter,
  UserPostsResult,
} from './types';

@Injectable()
export class UsersRepository {
  constructor(
    @InjectModel(User.name) private readonly userModel: UserModel,
    private readonly pagination: PaginationService,
  ) {}

  private live(filter: UserFilter = {}): UserFilter {
    return { ...filter, isDeleted: false };
  }

  async create(data: CreateUserData): Promise<UserDocument> {
    return this.userModel.create(data);
  }

  async findById(
    id: Types.ObjectId,
    projection?: ProjectionType<User>,
  ): Promise<UserDocument | null> {
    return this.userModel.findOne(this.live({ _id: id }), projection).exec();
  }

  async findByEmail(
    email: string,
    withCredentials = false,
  ): Promise<UserDocument | null> {
    const query = this.userModel.findOne(
      this.live({ email: email.toLowerCase() }),
    );
    if (withCredentials) {
      query.select('+passwordHash +failedLoginAttempts +lockedUntil');
    }
    return query.exec();
  }

  async existsByEmail(email: string): Promise<boolean> {
    const found = await this.userModel
      .exists(this.live({ email: email.toLowerCase() }))
      .exec();
    return found !== null;
  }

  /**
   * Served by `active_users_by_created`, or by `active_users_by_search_token`
   * when a `searchTerm` bounds the scan to matching users.
   */
  async findPaginated(
    query: SearchQueryDto,
  ): Promise<PagedResult<UserDocument>> {
    return this.pagination.fetchPage<UserDocument>(
      this.userModel,
      this.live(tokenSearchFilter<User>(query.searchTerm)),
      query,
      undefined,
      query.searchTerm ? USERS_SEARCH_INDEX : undefined,
    );
  }

  async updateById(
    id: Types.ObjectId,
    update: UpdateQuery<User>,
    options: QueryOptions<User> = {},
  ): Promise<UserDocument | null> {
    return this.userModel
      .findOneAndUpdate(this.live({ _id: id }), update, {
        new: true,
        runValidators: true, // schema rules apply to updates, not just inserts
        ...options,
      })
      .exec();
  }

  async softDeleteById(id: Types.ObjectId): Promise<UserDocument | null> {
    return this.updateById(id, {
      $set: { isDeleted: true, deletedAt: new Date() },
    });
  }

  async groupByInterests(
    query: QueryInterestsDto,
  ): Promise<InterestGroupsResult> {
    const [result] = await this.userModel.aggregate<InterestGroupsResult>(
      interestGroupsPipeline(query.skip, query.limit, query.interest),
    );
    return result ?? { items: [], total: 0 };
  }

  async findWithPosts(
    userId: Types.ObjectId,
    query: SearchQueryDto,
    includeDrafts: boolean,
  ): Promise<UserPostsResult | null> {
    const [result] = await this.userModel.aggregate<UserPostsResult>(
      userPostsPipeline(userId, query.skip, query.limit, {
        includeDrafts,
        searchTerm: query.searchTerm,
      }),
    );
    return result ?? null;
  }
}
