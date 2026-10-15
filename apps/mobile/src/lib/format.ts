import type { Locale } from './i18n';

/** +998901234567 → "+998 90 123 45 67"; other numbers are returned unchanged. */
export function formatPhone(e164: string): string {
  const match = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(e164);
  return match ? `+998 ${match.slice(1).join(' ')}` : e164;
}

/** What the user typed ("90 123 45 67" or "+998…") → the API's phone input. */
export function toApiPhone(input: string): string {
  const trimmed = input.trim();
  return trimmed.startsWith('+') ? trimmed : `+998${trimmed.replace(/\D/g, '')}`;
}

/** Uzbek mobile number typed without the country code is complete at 9 digits. */
export function isCompleteLocalPhone(input: string): boolean {
  const digits = input.replace(/\D/g, '');
  return input.trim().startsWith('+') ? digits.length >= 11 : digits.length === 9;
}

export function localized(name: { uz: string; ru: string }, locale: Locale): string {
  return name[locale] || name.uz;
}

/** Tashkent is UTC+5 all year (no daylight saving). */
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * "16.10.2026, 01:30" in Tashkent time. Formatted by hand: Intl data for
 * Uzbek is incomplete on some engines (e.g. "2026 M10 15").
 */
export function formatDateTime(iso: string, _locale: Locale): string {
  const d = new Date(new Date(iso).getTime() + TASHKENT_OFFSET_MS);
  const date = `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${String(d.getUTCFullYear())}`;
  return `${date}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
