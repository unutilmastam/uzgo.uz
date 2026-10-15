import { describe, expect, it } from 'vitest';
import { formatDateTime, formatPhone, isCompleteLocalPhone, localized, toApiPhone } from './format';

describe('mobile formatting', () => {
  it('formats and normalises Uzbek phone numbers', () => {
    expect(formatPhone('+998901234567')).toBe('+998 90 123 45 67');
    expect(formatPhone('+12025550123')).toBe('+12025550123');
    expect(toApiPhone(' 90 123-45-67 ')).toBe('+998901234567');
    expect(toApiPhone('+998 90 123 45 67')).toBe('+998 90 123 45 67');
    expect(isCompleteLocalPhone('90 123 45 67')).toBe(true);
    expect(isCompleteLocalPhone('90 123')).toBe(false);
  });

  it('picks the localized name with an Uzbek fallback', () => {
    expect(localized({ uz: 'Choy', ru: 'Чай' }, 'ru')).toBe('Чай');
    expect(localized({ uz: 'Choy', ru: '' }, 'ru')).toBe('Choy');
  });

  it('shows dates in Tashkent time', () => {
    expect(formatDateTime('2026-10-15T20:30:00Z', 'ru')).toBe('16.10.2026, 01:30');
    expect(formatDateTime('2026-01-01T00:05:00Z', 'uz')).toBe('01.01.2026, 05:05');
  });
});
