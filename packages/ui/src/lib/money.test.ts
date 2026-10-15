import { describe, expect, it } from 'vitest';
import { discountPercent, formatPrice, parseSomInput, somInputValue, toTiyin } from './money';

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

describe('soʻm input', () => {
  it('parses typed amounts into tiyin without floats', () => {
    expect(parseSomInput('2 500 000')).toBe('250000000');
    expect(parseSomInput('12500,5')).toBe('1250050');
    expect(parseSomInput('12500.05')).toBe('1250005');
    expect(parseSomInput('0,1')).toBe('10');
    for (const bad of ['', 'abc', '1,234', '-5', '1e5', '1,2,3', '999999999999']) {
      expect(parseSomInput(bad)).toBeNull();
    }
  });

  it('round-trips through the input value', () => {
    expect(somInputValue('250000000')).toBe('2500000');
    expect(somInputValue(1250050n)).toBe('12500,50');
    expect(parseSomInput(somInputValue('1250050'))).toBe('1250050');
  });
});
