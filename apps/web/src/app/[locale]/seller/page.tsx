import { Button } from '@uzgo/ui/components/button';
import { EmptyState } from '@uzgo/ui/components/empty-state';
import { Store } from 'lucide-react';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { PageShell } from '@/components/page-shell';
import { StoreStatusBadge } from '@/components/seller/status-badges';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { requireUser } from '@/lib/require-user';
import { getSellerStores } from '@/lib/seller-api';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('seller');
  return { title: t('title'), robots: { index: false } };
}

/** Seller home: the caller's stores and their review status. */
export default async function SellerHomePage() {
  await requireUser('/seller');
  const [t, locale, stores] = await Promise.all([
    getTranslations('seller'),
    getLocale() as Promise<Locale>,
    getSellerStores(),
  ]);
  const canApply = !stores.some((s) => s.status === 'PENDING' && s.myRole === 'OWNER');

  return (
    <PageShell title={t('title')}>
      {stores.length === 0 ? (
        <EmptyState
          icon={<Store />}
          title={t('noStores')}
          description={t('intro')}
          action={
            <Button asChild>
              <Link href="/seller/apply">{t('apply')}</Link>
            </Button>
          }
        />
      ) : (
        <section aria-labelledby="my-stores" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="my-stores" className="text-lg font-semibold">
              {t('myStores')}
            </h2>
            {canApply ? (
              <Button asChild variant="outline">
                <Link href="/seller/apply">{t('apply')}</Link>
              </Button>
            ) : null}
          </div>
          <ul className="grid gap-3 md:grid-cols-2">
            {stores.map((store) => (
              <li key={store.id}>
                <Link
                  href={`/seller/${store.id}`}
                  className="flex h-full flex-col gap-2 rounded-xl border border-border bg-card p-5 hover:border-primary"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold">{store.name[locale]}</span>
                    <StoreStatusBadge status={store.status} />
                  </div>
                  <span className="text-sm text-muted-foreground">{t(`role_${store.myRole}`)}</span>
                  {store.status === 'REJECTED' && store.reviewNote ? (
                    <span className="text-sm text-destructive">
                      {t('reviewNote', { note: store.reviewNote })}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageShell>
  );
}
