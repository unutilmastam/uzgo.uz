import { Badge } from '@uzgo/ui/components/badge';
import { Heart, Package, Store } from 'lucide-react';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { LogoutButtons } from '@/components/auth/logout-buttons';
import { ProfileForm } from '@/components/auth/profile-form';
import { PageShell } from '@/components/page-shell';
import { Link, redirect } from '@/i18n/navigation';
import { getCurrentUser, getRegions } from '@/lib/api-server';
import { formatPhone } from '@/lib/format-phone';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('account');
  return { title: t('title') };
}

/** Protected: the session is checked on the server for every request. */
export default async function AccountPage() {
  const [t, locale, user] = await Promise.all([
    getTranslations('account'),
    getLocale(),
    getCurrentUser(),
  ]);
  if (!user) redirect({ href: { pathname: '/login', query: { next: '/account' } }, locale });
  if (!user) return null;
  const regions = await getRegions();
  const name = [user.profile.firstName, user.profile.lastName].filter(Boolean).join(' ');

  return (
    <PageShell title={t('title')}>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section
          aria-labelledby="profile"
          className="rounded-xl border border-border bg-card p-5 md:p-6"
        >
          <p className="text-lg font-semibold">
            {name ? t('greeting', { name }) : t('greetingNoName')}
          </p>
          <dl className="mt-2 mb-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="text-muted-foreground">{t('phone')}</dt>
              <dd className="font-medium tabular-nums" data-testid="account-phone">
                {formatPhone(user.phone)}
              </dd>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <dt className="text-muted-foreground">{t('roles')}</dt>
              {user.roles.map((role) => (
                <dd key={role}>
                  <Badge variant="secondary">{t(`role_${role}`)}</Badge>
                </dd>
              ))}
            </div>
          </dl>
          <h2 id="profile" className="mb-4 text-base font-semibold">
            {t('profileTitle')}
          </h2>
          <ProfileForm user={user} regions={regions} />
        </section>
        <section
          aria-labelledby="security"
          className="h-fit rounded-xl border border-border bg-card p-5 md:p-6"
        >
          <h2 id="security" className="mb-4 text-base font-semibold">
            {t('securityTitle')}
          </h2>
          <LogoutButtons />
        </section>
        <Link
          href="/orders"
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-5 font-semibold hover:border-primary lg:col-start-2"
        >
          <Package aria-hidden="true" className="size-5 text-primary" />
          {t('myOrders')}
        </Link>
        <Link
          href="/favorites"
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-5 font-semibold hover:border-primary lg:col-start-2"
        >
          <Heart aria-hidden="true" className="size-5 text-primary" />
          {t('favorites')}
        </Link>
        <Link
          href="/seller"
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-5 font-semibold hover:border-primary lg:col-start-2"
        >
          <Store aria-hidden="true" className="size-5 text-primary" />
          {t('sellerPanel')}
        </Link>
      </div>
    </PageShell>
  );
}
