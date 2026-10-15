import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { PanelTabs } from '@/components/panel/panel-tabs';
import { isAdmin, requireStaff } from './staff';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin');
  return { title: t('title'), robots: { index: false, follow: false } };
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireStaff('/admin');
  const t = await getTranslations('admin');
  const tabs = [
    { href: '/admin', label: t('tabOverview'), exact: true },
    { href: '/admin/stores', label: t('tabStores') },
    { href: '/admin/products', label: t('tabProducts') },
    { href: '/admin/reviews', label: t('tabReviews') },
    ...(isAdmin(user)
      ? [
          { href: '/admin/catalog', label: t('tabCatalog') },
          { href: '/admin/users', label: t('tabUsers') },
          { href: '/admin/orders', label: t('tabOrders') },
          { href: '/admin/finance', label: t('tabFinance') },
          { href: '/admin/promo', label: t('tabPromo') },
          { href: '/admin/delivery', label: t('tabDelivery') },
          { href: '/admin/audit', label: t('tabAudit') },
        ]
      : []),
    { href: '/admin/security', label: t('tabSecurity') },
  ];
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:py-10">
      <h1 className="mb-4 text-2xl font-bold md:text-3xl">{t('title')}</h1>
      <PanelTabs label={t('title')} items={tabs} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
