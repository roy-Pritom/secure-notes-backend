import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Refresh tokens are already high-entropy, so a fast digest is the right tool:
 * bcrypt would silently truncate a JWT at 72 bytes and compare only its
 * near-identical header.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function tokenMatches(token: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashToken(token), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return (
    candidate.length === stored.length && timingSafeEqual(candidate, stored)
  );
}
