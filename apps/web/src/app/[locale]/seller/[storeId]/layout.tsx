import type { ReactNode } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import { PanelTabs } from '@/components/panel/panel-tabs';
import { StoreStatusBadge } from '@/components/seller/status-badges';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { loadSellerStore } from './store-context';

export default async function SellerStoreLayout({
  params,
  children,
}: {
  params: Promise<{ storeId: string }>;
  children: ReactNode;
}) {
  const { storeId } = await params;
  const { store } = await loadSellerStore(storeId, `/seller/${storeId}`);
  const [t, locale] = await Promise.all([
    getTranslations('seller'),
    getLocale() as Promise<Locale>,
  ]);
  const base = `/seller/${store.id}`;
  const tabs = [
    { href: base, label: t('tabProducts'), exact: true, also: [`${base}/products`] },
    { href: `${base}/orders`, label: t('tabOrders') },
    ...(store.myRole === 'OWNER' ? [{ href: `${base}/team`, label: t('tabTeam') }] : []),
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:py-10">
      <Link href="/seller" className="text-sm text-muted-foreground hover:text-foreground">
        {t('backToStores')}
      </Link>
      <div className="mt-2 mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold md:text-3xl">{store.name[locale]}</h1>
        <StoreStatusBadge status={store.status} />
      </div>
      {store.status === 'PENDING' ? (
        <p role="status" className="mb-4 rounded-lg bg-secondary p-3 text-sm">
          {t('pendingNotice')}
        </p>
      ) : null}
      {store.status === 'SUSPENDED' || store.status === 'REJECTED' ? (
        <p role="status" className="mb-4 rounded-lg bg-muted p-3 text-sm">
          {store.status === 'REJECTED' && store.reviewNote
            ? t('reviewNote', { note: store.reviewNote })
            : t('suspendedNotice')}
        </p>
      ) : null}
      <PanelTabs label={t('title')} items={tabs} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
