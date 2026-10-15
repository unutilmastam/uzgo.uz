/**
 * Content-Security-Policy for HTML pages (SECURITY.md, Phase 7). Scripts need
 * the per-request nonce; Next.js adds it to its own scripts when it finds the
 * policy on the request. Styles allow inline attributes (React style props,
 * the UI kit). Everything else is same-origin only.
 */
export function contentSecurityPolicy(nonce: string, dev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? ' ws:' : ''}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(dev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}
