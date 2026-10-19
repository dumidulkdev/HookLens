import { hashToken, verifyToken } from './token';

describe('management token verification', () => {
  it('accepts only the matching token and handles mismatched lengths', () => {
    const hash = hashToken('sample-token');
    expect(hash).toHaveLength(64);
    expect(verifyToken('sample-token', hash)).toBe(true);
    expect(verifyToken('different', hash)).toBe(false);
    expect(verifyToken('', hash)).toBe(false);
    expect(verifyToken('sample-token', 'invalid')).toBe(false);
  });
});
