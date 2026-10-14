import { describe, expect, it } from 'vitest';
import { hmac, randomNumericCode, randomToken, safeEqualHex, sha256 } from './crypto.js';

describe('crypto helpers', () => {
  it('creates 6-digit codes including leading zeros', () => {
    for (let i = 0; i < 200; i++) expect(randomNumericCode()).toMatch(/^\d{6}$/);
  });

  it('creates long unique tokens', () => {
    const a = randomToken();
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(a).not.toBe(randomToken());
  });

  it('compares digests in constant time and handles length mismatch', () => {
    const digest = sha256('x');
    expect(safeEqualHex(digest, sha256('x'))).toBe(true);
    expect(safeEqualHex(digest, sha256('y'))).toBe(false);
    expect(safeEqualHex(digest, 'abcd')).toBe(false);
    expect(hmac('k', 'v')).not.toBe(hmac('k2', 'v'));
  });
});
