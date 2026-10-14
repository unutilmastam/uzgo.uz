/**
 * Only same-site relative paths are allowed as post-login redirects
 * (prevents open redirects such as ?next=//evil.example).
 */
export function safeNextPath(value: string | string[] | undefined, fallback = '/account'): string {
  const next = Array.isArray(value) ? value[0] : value;
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\'))
    return fallback;
  if (/^\/(uz|ru)(\/|$)/.test(next)) return fallback;
  return next;
}
