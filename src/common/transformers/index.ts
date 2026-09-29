import { TransformFnParams } from 'class-transformer';

// `class-transformer` types `value` as `any`. These helpers narrow it once so
// DTOs stay type-safe and normalization is not re-written in every file.

export const trimString = ({ value }: TransformFnParams): unknown => {
  const raw: unknown = value;
  return typeof raw === 'string' ? raw.trim() : raw;
};

/** Emails are compared and indexed case-insensitively. */
export const normalizeEmail = ({ value }: TransformFnParams): unknown => {
  const raw: unknown = value;
  return typeof raw === 'string' ? raw.trim().toLowerCase() : raw;
};

export const toLowerCase = ({ value }: TransformFnParams): unknown => {
  const raw: unknown = value;
  return typeof raw === 'string' ? raw.toLowerCase() : raw;
};

export const toInt = ({ value }: TransformFnParams): unknown => {
  const raw: unknown = value;
  if (typeof raw === 'number') return raw;
  if (typeof raw !== 'string' || raw.trim() === '') return raw;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? raw : parsed;
};

export const toBoolean = ({ value }: TransformFnParams): unknown => {
  const raw: unknown = value;
  if (typeof raw === 'boolean') return raw;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return raw;
};

/** Tag lists are stored lowercase and trimmed so grouping is exact. */
export const normalizeTags = ({ value }: TransformFnParams): unknown => {
  const raw: unknown = value;
  return Array.isArray(raw)
    ? raw.map((tag: unknown) =>
        typeof tag === 'string' ? tag.trim().toLowerCase() : tag,
      )
    : raw;
};
