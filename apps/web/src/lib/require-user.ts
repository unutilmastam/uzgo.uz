import type { CurrentUser } from '@uzgo/contracts';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getCurrentUser } from './api-server';

/** The signed-in user, or a redirect to the login page that returns to `next`. */
export async function requireUser(next: string): Promise<CurrentUser> {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  if (!user) return redirect({ href: { pathname: '/login', query: { next } }, locale });
  return user;
}
