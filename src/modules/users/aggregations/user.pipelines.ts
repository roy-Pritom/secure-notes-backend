import { PipelineStage, Types } from 'mongoose';

import { searchFilter } from '../../../common/search';
import { Post, POST_COLLECTION } from '../../posts/schemas/post.schema';

const FULL_NAME = { $concat: ['$firstName', ' ', '$lastName'] };

/**
 * A `$facet` tail that pages the pipeline and returns the total in the same
 * pass, so a list view never needs a second round trip.
 */
function paginate(
  itemStages: PipelineStage.FacetPipelineStage[],
  skip: number,
  limit: number,
): PipelineStage[] {
  return [
    {
      $facet: {
        items: [{ $skip: skip }, { $limit: limit }, ...itemStages],
        meta: [{ $count: 'total' }],
      },
    },
    {
      $project: {
        items: 1,
        total: { $ifNull: [{ $arrayElemAt: ['$meta.total', 0] }, 0] },
      },
    },
  ];
}

/**
 * Scenario 1 — users grouped by interest. Served by `active_users_by_interest`:
 * the leading `$match` hits its prefix, and an `interest` makes it a two-key
 * equality.
 */
export function interestGroupsPipeline(
  skip: number,
  limit: number,
  interest?: string,
): PipelineStage[] {
  const match = interest
    ? { isDeleted: false, interests: interest }
    : { isDeleted: false };

  return [
    { $match: match },
    { $unwind: '$interests' },
    // `$unwind` re-emits every interest of a matched user, so the filter has
    // to be re-applied to keep the result to the interest that was asked for.
    ...(interest ? [{ $match: { interests: interest } }] : []),
    {
      $group: {
        _id: '$interests',
        userCount: { $sum: 1 },
        users: {
          $push: {
            id: '$_id',
            fullName: FULL_NAME,
            email: '$email',
            avatarUrl: '$avatarUrl',
          },
        },
      },
    },
    { $sort: { userCount: -1, _id: 1 } },
    ...paginate(
      [{ $project: { _id: 0, interest: '$_id', userCount: 1, users: 1 } }],
      skip,
      limit,
    ),
  ];
}

/** A post is found by what it says and by how it was filed. */
const POST_SEARCHABLE_FIELDS = ['title', 'body', 'excerpt', 'tags'] as const;

/**
 * Scenario 2 — one user with their posts in a single pass. The `$lookup` joins
 * through `posts_by_author_created`, which also serves the sub-pipeline's
 * `$match` and `$sort`. A `searchTerm` joins that `$match`, so `total`
 * describes the filtered set rather than the whole authorship.
 */
export function userPostsPipeline(
  userId: Types.ObjectId,
  skip: number,
  limit: number,
  searchTerm?: string,
): PipelineStage[] {
  return [
    { $match: { _id: userId, isDeleted: false } },
    {
      $lookup: {
        from: POST_COLLECTION,
        localField: '_id',
        foreignField: 'author',
        as: 'posts',
        pipeline: [
          {
            $match: {
              isDeleted: false,
              ...searchFilter<Post>(searchTerm, POST_SEARCHABLE_FIELDS),
            },
          },
          { $sort: { createdAt: -1 } },
          {
            $facet: {
              items: [
                { $skip: skip },
                { $limit: limit },
                {
                  $project: {
                    _id: 0,
                    id: '$_id',
                    title: 1,
                    body: 1,
                    excerpt: 1,
                    tags: 1,
                    status: 1,
                    publishedAt: 1,
                    createdAt: 1,
                  },
                },
              ],
              meta: [{ $count: 'total' }],
            },
          },
        ],
      },
    },
    // The sub-pipeline always yields exactly one facet document.
    { $unwind: '$posts' },
    {
      $project: {
        _id: 0,
        author: {
          id: '$_id',
          fullName: FULL_NAME,
          email: '$email',
          avatarUrl: '$avatarUrl',
        },
        items: '$posts.items',
        total: { $ifNull: [{ $arrayElemAt: ['$posts.meta.total', 0] }, 0] },
      },
    },
  ];
}
