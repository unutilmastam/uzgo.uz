import { describe, expect, it } from 'vitest';
import { discountPercent, formatPrice, toTiyin } from './money';

const nb = (s: string) => s.replace(/ /g, ' ');

describe('formatPrice', () => {
  it('formats whole soʻm with grouping per locale', () => {
    expect(formatPrice(1250000n, 'uz')).toBe(nb('12 500 soʻm'));
    expect(formatPrice('1250000', 'ru')).toBe(nb('12 500 сум'));
    expect(formatPrice(123456789900n, 'uz')).toBe(nb('1 234 567 899 soʻm'));
    expect(formatPrice(0n, 'uz')).toBe(nb('0 soʻm'));
  });

  it('shows tiyin only when present', () => {
    expect(formatPrice(1250050n, 'uz')).toBe(nb('12 500,50 soʻm'));
    expect(formatPrice(5n, 'ru')).toBe(nb('0,05 сум'));
  });

  it('keeps precision beyond Number.MAX_SAFE_INTEGER', () => {
    expect(formatPrice('900719925474099300', 'uz')).toBe(nb('9 007 199 254 740 993 soʻm'));
  });

  it('rejects non-integer strings', () => {
    expect(() => toTiyin('12.5')).toThrow();
    expect(() => toTiyin('1e6')).toThrow();
  });
});

describe('discountPercent', () => {
  it('computes a rounded-down percentage', () => {
    expect(discountPercent(1000000n, 750000n)).toBe(25);
    expect(discountPercent('300000', '200000')).toBe(33);
  });

  it('returns 0 when there is no discount', () => {
    expect(discountPercent(100n, 100n)).toBe(0);
    expect(discountPercent(100n, 120n)).toBe(0);
    expect(discountPercent(0n, 0n)).toBe(0);
  });
});
