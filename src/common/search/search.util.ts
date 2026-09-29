import { FilterQuery } from 'mongoose';

/**
 * Everything the caller typed is data, never syntax. Without this a search for
 * `(a+)+$` would be compiled as a pattern and evaluated against every scanned
 * document — catastrophic backtracking from a query string.
 */
const REGEX_METACHARACTERS = /[.*+?^${}()|[\]\\]/g;

export function escapeRegex(term: string): string {
  return term.replace(REGEX_METACHARACTERS, '\\$&');
}



export function searchFilter<T>(
  term: string | undefined,
  fields: readonly (keyof T & string)[],
): FilterQuery<T> | undefined {
  if (!term || fields.length === 0) {
    return undefined;
  }

  const pattern = new RegExp(escapeRegex(term), 'i');
  
  return {
    $or: fields.map((field) => ({ [field]: pattern }) as FilterQuery<T>),
  };
}
