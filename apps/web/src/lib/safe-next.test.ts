import { describe, expect, it } from 'vitest';
import { safeNextPath } from './safe-next';

describe('safeNextPath', () => {
  it('keeps internal paths', () => {
    expect(safeNextPath('/cart')).toBe('/cart');
    expect(safeNextPath(['/account', '/x'])).toBe('/account');
  });

  it('rejects external, protocol-relative and odd values', () => {
    for (const value of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      'cart',
      '',
      undefined,
    ]) {
      expect(safeNextPath(value)).toBe('/account');
    }
  });

  it('rejects locale-prefixed paths (the router adds the locale)', () => {
    expect(safeNextPath('/ru/cart')).toBe('/account');
  });
});
