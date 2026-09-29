import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ProjectionType, QueryOptions, Types, UpdateQuery } from 'mongoose';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { interestGroupsPipeline, userPostsPipeline } from './aggregations';
import { QueryInterestsDto } from './dto';
import { User, type UserDocument, type UserModel } from './schemas/user.schema';
import {
  CreateUserData,
  InterestGroupsResult,
  UserFilter,
  UserPostsResult,
} from './types';

/**
 * The only place that talks to the `users` collection, so every query
 * consistently excludes soft-deleted rows.
 */
@Injectable()
export class UsersRepository {
  constructor(@InjectModel(User.name) private readonly userModel: UserModel) {}

  /** Scopes a filter to live documents. */
  private live(filter: UserFilter = {}): UserFilter {
    return { ...filter, deletedAt: null };
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

  /** @param withCredentials loads the `select: false` auth fields — auth flow only. */
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

  /** Served by `active_users_by_created`. */
  async findPaginated(
    query: PaginationQueryDto,
  ): Promise<{ items: UserDocument[]; total: number }> {
    const filter = this.live();

    const [items, total] = await Promise.all([
      this.userModel
        .find(filter)
        .sort({ createdAt: query.createdAtSort })
        .skip(query.skip)
        .limit(query.limit)
        .exec(),
      this.userModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
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

  /**
   * The row stays for audit, but its email address is freed. Sessions are
   * revoked by `UsersService`, which owns the `refresh_tokens` collaborator.
   */
  async softDeleteById(id: Types.ObjectId): Promise<UserDocument | null> {
    return this.updateById(id, { $set: { deletedAt: new Date() } });
  }

  /** Scenario 1: users grouped by interest, in a single aggregation call. */
  async groupByInterests(
    query: QueryInterestsDto,
  ): Promise<InterestGroupsResult> {
    const [result] = await this.userModel.aggregate<InterestGroupsResult>(
      interestGroupsPipeline(query.skip, query.limit, query.interest),
    );
    return result ?? { items: [], total: 0 };
  }

  /** Scenario 2: one user joined to their posts through a single `$lookup`. */
  async findWithPosts(
    userId: Types.ObjectId,
    query: PaginationQueryDto,
  ): Promise<UserPostsResult | null> {
    const [result] = await this.userModel.aggregate<UserPostsResult>(
      userPostsPipeline(userId, query.skip, query.limit),
    );
    return result ?? null;
  }
}
