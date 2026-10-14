/** +998901234567 → "+998 90 123 45 67"; other numbers are returned unchanged. */
export function formatPhone(e164: string): string {
  const match = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(e164);
  return match ? `+998 ${match.slice(1).join(' ')}` : e164;
}
