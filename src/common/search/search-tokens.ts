import {
  FilterQuery,
  Model,
  Query,
  Schema,
  trusted,
  UpdateQuery,
} from 'mongoose';

import { escapeRegex } from './search.util';

/**
 * Free-text search that an index can answer.
 *
 * An unanchored, case-insensitive regex over `title`/`body`/… can only be
 * checked document by document, so the index narrows the scan but never the
 * match. `$text` would be indexed, but MongoDB refuses it anywhere but the
 * first stage of a pipeline — which rules it out inside the posts `$lookup`.
 *
 * Instead every searchable document carries `searchTokens`: the lowercase,
 * accent-folded words of its searchable fields. A search term is split the same
 * way and each word becomes an anchored, case-sensitive prefix regex
 * (`/^word/`), which MongoDB turns into tight bounds on a multikey index.
 * The trade: a term matches whole words and word starts ("endgam" finds
 * "endgames"), not arbitrary substrings ("game" does not).
 */

export const SEARCH_TOKENS_PATH = 'searchTokens';

/** Longer words are cut here, on both sides, so a prefix still lines up. */
const MAX_TOKEN_LENGTH = 64;

const WORD_SEPARATOR = /[^\p{L}\p{N}]+/u;
const COMBINING_MARKS = /\p{M}/gu;

type TokenSource = string | readonly string[] | null | undefined;

/** Lowercase, accent-folded, de-duplicated words, in first-seen order. */
export function tokenize(...values: TokenSource[]): string[] {
  const tokens = new Set<string>();
  for (const value of values.flat()) {
    if (typeof value !== 'string') continue;
    for (const word of value
      .normalize('NFKD')
      .replace(COMBINING_MARKS, '')
      .toLowerCase()
      .split(WORD_SEPARATOR)) {
      if (word) tokens.add(word.slice(0, MAX_TOKEN_LENGTH));
    }
  }
  return [...tokens];
}

/**
 * Every word of the term must start some token. A term with no words in it
 * (`.*`, `@@`) matches nothing rather than everything.
 *
 * The operators are wrapped in `trusted()` because the connection runs with
 * `sanitizeFilter`, which would otherwise turn them into literal values. That
 * is safe here: they are built on the server, and the caller's input only ever
 * reaches the query as an escaped, anchored regex.
 */
export function tokenSearchFilter<T>(
  term: string | undefined,
): FilterQuery<T> | undefined {
  if (!term) return undefined;

  const words = tokenize(term);
  if (words.length === 0) {
    return { [SEARCH_TOKENS_PATH]: trusted({ $in: [] }) };
  }

  // Longest first: the planner bounds the index scan on the first clause, and
  // a longer prefix is the more selective range.
  const prefixes = words
    .sort((a, b) => b.length - a.length)
    .map((word) => new RegExp(`^${escapeRegex(word)}`));

  return {
    [SEARCH_TOKENS_PATH]: trusted({ $all: prefixes }),
  };
}

export interface SearchTokensOptions {
  /** Top-level string or string-array paths whose words are searchable. */
  fields: readonly string[];
}

type UpdateDoc = UpdateQuery<Record<string, unknown>>;

/** Which fields each plugged schema tokenizes, for the backfill to read back. */
const TOKEN_FIELDS = new WeakMap<Schema, readonly string[]>();

/**
 * Keeps `searchTokens` in step with `fields` on every write path the app uses:
 * `create`/`save` and single-document updates. A multi-document update that
 * touches a searchable field is refused — its tokens cannot be recomputed
 * without reading each document, and a silently stale index is worse.
 */
export function searchTokensPlugin(
  schema: Schema,
  { fields }: SearchTokensOptions,
): void {
  schema.add({
    [SEARCH_TOKENS_PATH]: { type: [String], default: undefined, select: false },
  });
  TOKEN_FIELDS.set(schema, fields);

  schema.pre('save', function () {
    if (this.isNew || fields.some((field) => this.isModified(field))) {
      this.set(
        SEARCH_TOKENS_PATH,
        tokenize(...fields.map((field) => this.get(field) as TokenSource)),
      );
    }
  });

  schema.pre('updateMany', function () {
    if (touchedFields(this.getUpdate(), fields).length > 0) {
      throw new Error(
        `updateMany cannot change searchable fields (${fields.join(', ')}); update documents one at a time`,
      );
    }
  });

  schema.pre(['findOneAndUpdate', 'updateOne'], async function () {
    const query = this as Query<unknown, unknown>;
    const update = query.getUpdate();
    if (touchedFields(update, fields).length === 0) return;

    const current = await query.model
      .findOne(query.getFilter())
      .select(fields.join(' '))
      .lean<Record<string, TokenSource>>()
      .exec();
    // No match: the update is a no-op, so there is nothing to keep in step.
    if (!current) return;

    const next = { ...current, ...incomingValues(update, fields) };
    query.set(
      SEARCH_TOKENS_PATH,
      tokenize(...fields.map((field) => next[field])),
    );
  });
}

/** The searchable fields an update writes, whether via `$set`, bare keys or `$unset`. */
function touchedFields(
  update: UpdateDoc | null,
  fields: readonly string[],
): string[] {
  if (!update || Array.isArray(update)) return [];
  const written = new Set([
    ...Object.keys(update).filter((key) => !key.startsWith('$')),
    ...Object.keys((update.$set as object | undefined) ?? {}),
    ...Object.keys((update.$unset as object | undefined) ?? {}),
    ...Object.keys((update.$push as object | undefined) ?? {}),
    ...Object.keys((update.$addToSet as object | undefined) ?? {}),
    ...Object.keys((update.$pull as object | undefined) ?? {}),
  ]);
  return fields.filter((field) => written.has(field));
}

function incomingValues(
  update: UpdateDoc | null,
  fields: readonly string[],
): Record<string, TokenSource> {
  if (!update) return {};
  const set: Record<string, unknown> = update.$set ?? {};
  const unset: Record<string, unknown> = update.$unset ?? {};
  const values: Record<string, TokenSource> = {};
  for (const field of fields) {
    if (field in unset) values[field] = null;
    if (field in update && !field.startsWith('$')) {
      values[field] = update[field] as TokenSource;
    }
    if (field in set) values[field] = set[field] as TokenSource;
  }
  return values;
}

/**
 * Fills `searchTokens` on documents written before the field existed. Batched
 * with `bulkWrite`, and a no-op once every document has its tokens.
 */
export async function backfillSearchTokens<T>(
  model: Model<T>,
  batchSize = 500,
): Promise<number> {
  const fields = TOKEN_FIELDS.get(model.schema);
  if (!fields) return 0;

  const cursor = model
    .find({ [SEARCH_TOKENS_PATH]: trusted({ $exists: false }) })
    .select(fields.join(' '))
    .lean<Record<string, unknown>>()
    .cursor();

  let batch: Parameters<Model<T>['bulkWrite']>[0] = [];
  let filled = 0;

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    await model.bulkWrite(batch, { ordered: false });
    filled += batch.length;
    batch = [];
  };

  for await (const doc of cursor) {
    batch.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $set: {
            [SEARCH_TOKENS_PATH]: tokenize(
              ...fields.map((field) => doc[field] as TokenSource),
            ),
          },
        },
        // Raw write: the tokens are already computed, so skip the update hooks.
        timestamps: false,
      },
    });
    if (batch.length >= batchSize) await flush();
  }
  await flush();
  return filled;
}
