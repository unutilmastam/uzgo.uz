import { describe, expect, it } from 'vitest';
import { formatPhone } from './format-phone';

describe('formatPhone', () => {
  it('groups Uzbek numbers and leaves others as is', () => {
    expect(formatPhone('+998901234567')).toBe('+998 90 123 45 67');
    expect(formatPhone('+79123456789')).toBe('+79123456789');
  });
});
