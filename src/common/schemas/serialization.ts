import { Schema, Types } from 'mongoose';

export type DocumentTransform = (
  doc: unknown,
  ret: Record<string, unknown>,
) => Record<string, unknown>;

/**
 * Normalizes an outgoing document: `_id` becomes a string `id`, `__v` is
 * dropped. Applied per-schema rather than via `mongoose.plugin()`, which only
 * reaches models compiled after it is registered.
 */
export function applyDocumentSerialization(
  schema: Schema,
  extra?: DocumentTransform,
): void {
  const transform: DocumentTransform = (doc, ret) => {
    const id: unknown = ret._id;
    if (id instanceof Types.ObjectId) {
      ret.id = id.toHexString();
    } else if (typeof id === 'string') {
      ret.id = id;
    }
    delete ret._id;
    delete ret.__v;
    // Search plumbing, never content: a freshly created document still has it.
    delete ret.searchTokens;
    return extra ? extra(doc, ret) : ret;
  };

  const options = { virtuals: true, versionKey: false, transform };
  schema.set('toJSON', options);
  schema.set('toObject', options);
}
