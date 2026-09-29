import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  ClientSession,
  ProjectionType,
  QueryOptions,
  Types,
  UpdateQuery,
} from 'mongoose';

import { escapeRegExp } from '../../common/utils';
import { QueryUsersDto } from './dto';
import { User, type UserDocument, type UserModel } from './schemas/user.schema';
import { CreateUserData, UserFilter } from './types';

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

  async create(
    data: CreateUserData,
    session?: ClientSession,
  ): Promise<UserDocument> {
    const [created] = await this.userModel.create([data], { session });
    return created;
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

  async findPaginated(
    query: QueryUsersDto,
  ): Promise<{ items: UserDocument[]; total: number }> {
    const filter = this.buildFilter(query);
    const sort: Record<string, 1 | -1> = {
      [query.sortBy]: query.sortOrder === 'asc' ? 1 : -1,
    };

    const [items, total] = await Promise.all([
      this.userModel
        .find(filter)
        .sort(sort)
        .skip(query.skip)
        .limit(query.limit)
        .collation({ locale: 'en', strength: 2 }) // case-insensitive, index-friendly
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

  /** The row stays for audit, but its email address is freed. */
  async softDeleteById(id: Types.ObjectId): Promise<UserDocument | null> {
    return this.updateById(id, { $set: { deletedAt: new Date() } });
  }

  private buildFilter(query: QueryUsersDto): UserFilter {
    const filter: UserFilter = this.live();

    if (query.status) {
      filter.status = query.status;
    }

    if (query.role) {
      filter.roles = query.role;
    }

    if (query.search) {
      const term = escapeRegExp(query.search);
      filter.$or = [
        { email: { $regex: term, $options: 'i' } },
        { firstName: { $regex: term, $options: 'i' } },
        { lastName: { $regex: term, $options: 'i' } },
      ];
    }

    return filter;
  }
}
