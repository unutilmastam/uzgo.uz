import type { NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { contentSecurityPolicy } from './lib/csp';

// Redirects "/" and unprefixed paths to a locale (default uz, or the user's
// saved/accepted language) and keeps the locale cookie in sync.
const handleI18n = createMiddleware(routing);

/** Adds a per-request nonce CSP (read by Next.js and the layout via x-nonce). */
export default function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV === 'development');
  request.headers.set('x-nonce', nonce);
  request.headers.set('content-security-policy', csp);
  const response = handleI18n(request);
  response.headers.set('content-security-policy', csp);
  return response;
}

export const config = {
  // Skip the API, Next.js internals and files with an extension.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
