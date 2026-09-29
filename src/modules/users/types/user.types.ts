import { FilterQuery, Types } from 'mongoose';

import { User } from '../schemas/user.schema';

/** A user as returned by `.lean()` — plain data, no document methods. */
export interface LeanUser extends Omit<User, '_id'> {
  _id: Types.ObjectId;
}

/** Fields the service is allowed to write when creating a user. */
export interface CreateUserData {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  roles?: User['roles'];
}

export type UserFilter = FilterQuery<User>;

/** Narrow view for the auth layer; never widen this to the whole document. */
export interface AuthenticatableUser {
  id: string;
  email: string;
  roles: User['roles'];
  status: User['status'];
}
