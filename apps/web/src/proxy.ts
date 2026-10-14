import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// Redirects "/" and unprefixed paths to a locale (default uz, or the user's
// saved/accepted language) and keeps the locale cookie in sync.
export default createMiddleware(routing);

export const config = {
  // Skip the API, Next.js internals and files with an extension.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
