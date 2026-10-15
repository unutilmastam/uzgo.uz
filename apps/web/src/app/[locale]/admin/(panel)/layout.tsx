import type { ReactNode } from 'react';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getTotpStatus } from '@/lib/admin-api';

/** Second-factor gate: staff pages need a session verified with TOTP. */
export default async function AdminPanelLayout({ children }: { children: ReactNode }) {
  const [status, locale] = await Promise.all([getTotpStatus(), getLocale()]);
  if (status?.required && !status.sessionVerified) {
    redirect({ href: '/admin/security', locale });
  }
  return children;
}
