/**
 * Masks a phone number for logs: +998901234567 → +99890*****67.
 * Never log full phone numbers (docs/SECURITY.md).
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return '*'.repeat(digits.length);
  return `+${digits.slice(0, 5)}${'*'.repeat(digits.length - 7)}${digits.slice(-2)}`;
}

/** Log paths whose values are always replaced with "[REDACTED]". */
export const REDACTED_LOG_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.secret',
  '*.otp',
  '*.code',
  '*.cardNumber',
  '*.pan',
  '*.cvv',
];
