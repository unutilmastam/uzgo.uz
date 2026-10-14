import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

/**
 * Normalises user input to E.164 (+998901234567). Uzbekistan is the default
 * country; other valid international numbers are accepted (SPEC §3).
 * Returns null for anything that is not a valid phone number.
 */
export function normalizePhone(input: string): string | null {
  const parsed = parsePhoneNumberFromString(input.trim(), 'UZ');
  if (!parsed?.isValid()) return null;
  return parsed.number;
}
