const REGEX_METACHARACTERS = /[.*+?^${}()|[\]\\]/g;

export function escapeRegex(term: string): string {
  return term.replace(REGEX_METACHARACTERS, '\\$&');
}
