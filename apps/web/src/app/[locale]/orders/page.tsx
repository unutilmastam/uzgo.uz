import { Button } from '@uzgo/ui/components/button';
import { EmptyState } from '@uzgo/ui/components/empty-state';
import { Price } from '@uzgo/ui/components/price';
import { Package } from 'lucide-react';
import type { Metadata } from 'next';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { OrderStatusBadge } from '@/components/orders/status-badge';
import { PageShell } from '@/components/page-shell';
import { Link, redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { getCurrentUser, getMyOrders } from '@/lib/api-server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('orders');
  return { title: t('title'), robots: { index: false } };
}

export default async function OrdersPage() {
  const [t, locale, format, user] = await Promise.all([
    getTranslations(),
    getLocale(),
    getFormatter(),
    getCurrentUser(),
  ]);
  if (!user) redirect({ href: { pathname: '/login', query: { next: '/orders' } }, locale });
  const orders = await getMyOrders();
  return (
    <PageShell title={t('orders.title')}>
      {orders.length === 0 ? (
        <EmptyState
          icon={<Package />}
          title={t('orders.emptyTitle')}
          action={
            <Button asChild>
              <Link href="/catalog">{t('cart.cta')}</Link>
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((order) => (
            <li key={order.number}>
              <Link
                href={`/orders/${order.number}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary"
              >
                <div className="flex flex-col gap-1">
                  <span className="font-semibold">
                    {t('orders.number', { number: order.number })}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {format.dateTime(new Date(order.createdAt), { dateStyle: 'medium' })} ·{' '}
                    {t('orders.items', { count: order.itemCount })}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <OrderStatusBadge status={order.status} />
                  <Price value={order.totalTiyin} locale={locale as Locale} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
