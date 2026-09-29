import { FlattenMaps, HydratedDocument, Types } from 'mongoose';

/** A document as returned by `.lean()` — a plain object, not a model. */
export type Lean<T> = FlattenMaps<T> & { _id: Types.ObjectId };

export type Doc<T> = HydratedDocument<T>;

export type Nullable<T> = T | null;

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}
