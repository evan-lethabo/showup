// There are no accounts. Two kinds of bearer secret stand in for them:
//   - the organiser token, created with the event and kept in the organiser's private link;
//   - a guest credential "<participantId>.<secret>", issued when someone joins.
// Only the SHA-256 hash is stored, so a database leak can't be replayed as a login, and comparison is constant-time.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Event and participant ids: 96 random bits, base64url (16 characters). */
export const ID_PATTERN = /^[A-Za-z0-9_-]{16}$/;

export function newId(): string {
  return randomBytes(12).toString('base64url');
}

/** Bearer credentials: 256 random bits, base64url (43 characters). Only the SHA-256 hash is stored. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Constant-time check of a presented token against a stored hex SHA-256 hash. */
export function tokenMatches(presented: unknown, storedHash: string): boolean {
  if (typeof presented !== 'string' || presented.length === 0 || presented.length > 256) return false;
  const a = Buffer.from(hashToken(presented), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
