import { PipelineStage, Types } from 'mongoose';

import { POST_COLLECTION } from '../../posts/schemas/post.schema';

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
 * Scenario 1 — users grouped by interest.
 *
 * Index: `active_users_by_interest` ({ deletedAt: 1, interests: 1 }). The
 * leading `$match` hits its prefix, and a supplied `interest` makes it an
 * exact two-key equality.
 */
export function interestGroupsPipeline(
  skip: number,
  limit: number,
  interest?: string,
): PipelineStage[] {
  const match = interest
    ? { deletedAt: null, interests: interest }
    : { deletedAt: null };

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
          $push: { id: '$_id', fullName: FULL_NAME, email: '$email' },
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

/**
 * Scenario 2 — one user with their posts, joined in a single pass.
 *
 * Index: `posts_by_author_created` ({ author: 1, createdAt: -1 }) drives both
 * the join on `author` and the `$sort` inside the sub-pipeline.
 */
export function userPostsPipeline(
  userId: Types.ObjectId,
  skip: number,
  limit: number,
): PipelineStage[] {
  return [
    { $match: { _id: userId, deletedAt: null } },
    {
      $lookup: {
        from: POST_COLLECTION,
        localField: '_id',
        foreignField: 'author',
        as: 'posts',
        pipeline: [
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
        author: { id: '$_id', fullName: FULL_NAME, email: '$email' },
        items: '$posts.items',
        total: { $ifNull: [{ $arrayElemAt: ['$posts.meta.total', 0] }, 0] },
      },
    },
  ];
}
