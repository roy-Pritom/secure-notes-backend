/** Escapes regex metacharacters so user input like `(a+)+$` is matched literally. */
export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
