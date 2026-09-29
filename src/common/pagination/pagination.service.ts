import { Injectable } from '@nestjs/common';
import { FilterQuery, Model } from 'mongoose';

import { PaginatedResponseDto } from './paginated-response.dto';
import { PaginationQueryDto } from './pagination-query.dto';
import { PagedResult, SortSpec } from './pagination.types';

@Injectable()
export class PaginationService {
  /**
   * @param sort overrides the default `createdAt` ordering — for a listing
   * whose index puts another key first, such as notes pinned to the top.
   */
  async fetchPage<TDoc>(
    model: Model<TDoc>,
    filter: FilterQuery<TDoc>,
    query: PaginationQueryDto,
    sort?: SortSpec,
  ): Promise<PagedResult<TDoc>> {
    const [items, total] = await Promise.all([
      model
        .find(filter)
        .sort(sort ?? { createdAt: query.createdAtSort })
        .skip(query.skip)
        .limit(query.limit)
        .exec(),
      model.countDocuments(filter).exec(),
    ]);

    return { items: items as TDoc[], total };
  }

  /** Wraps a fetched page in the response envelope. */
  toResponse<T>(
    result: PagedResult<T>,
    query: PaginationQueryDto,
  ): PaginatedResponseDto<T>;
  /** Wraps a fetched page, mapping entities to response DTOs on the way. */
  toResponse<TSource, TResult>(
    result: PagedResult<TSource>,
    query: PaginationQueryDto,
    map: (items: TSource[]) => TResult[],
  ): PaginatedResponseDto<TResult>;
  toResponse(
    result: PagedResult<unknown>,
    query: PaginationQueryDto,
    map?: (items: unknown[]) => unknown[],
  ): PaginatedResponseDto<unknown> {
    const { page, limit } = query;
    const totalPages = limit > 0 ? Math.ceil(result.total / limit) : 0;

    return {
      items: map ? map(result.items) : result.items,
      meta: {
        total: result.total,
        page,
        limit,
        totalPages,
        // Not `items.length === limit`: a full last page would otherwise
        // advertise a next one that does not exist.
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }
}
