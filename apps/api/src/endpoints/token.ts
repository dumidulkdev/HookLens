import { createHash, timingSafeEqual } from 'node:crypto';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function verifyToken(token: string, expectedHash: string): boolean {
  const digest = Buffer.from(hashToken(token), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return expected.length === digest.length && timingSafeEqual(digest, expected);
}
