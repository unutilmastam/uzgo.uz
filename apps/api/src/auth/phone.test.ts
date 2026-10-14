import { describe, expect, it } from 'vitest';
import { normalizePhone } from './phone.js';

describe('normalizePhone', () => {
  it('normalises Uzbek numbers in common formats', () => {
    for (const input of ['+998 90 123 45 67', '998901234567', '90 123-45-67', '(90) 1234567']) {
      expect(normalizePhone(input)).toBe('+998901234567');
    }
  });

  it('accepts valid foreign numbers', () => {
    expect(normalizePhone('+7 912 345 67 89')).toBe('+79123456789');
  });

  it('rejects invalid numbers', () => {
    for (const input of ['123', '+998 00 000 00 00', 'abc', '+99890123456789']) {
      expect(normalizePhone(input)).toBeNull();
    }
  });
});
