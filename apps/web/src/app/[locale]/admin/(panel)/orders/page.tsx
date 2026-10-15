import { ORDER_STATUSES } from '@uzgo/contracts';
import { Button } from '@uzgo/ui/components/button';
import { EmptyState } from '@uzgo/ui/components/empty-state';
import { Input } from '@uzgo/ui/components/input';
import { Pagination } from '@uzgo/ui/components/pagination';
import { Price } from '@uzgo/ui/components/price';
import { Package } from 'lucide-react';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { OrderStatusBadge } from '@/components/orders/status-badge';
import { StatusFilter } from '@/components/panel/status-filter';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { getAdminOrders } from '@/lib/admin-api';
import { formatPhone } from '@/lib/format-phone';
import { requireStaff } from '../../staff';

type OrderStatus = (typeof ORDER_STATUSES)[number];

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; number?: string; page?: string }>;
}) {
  await requireStaff('/admin/orders', 'admin');
  const query = await searchParams;
  const status = ORDER_STATUSES.includes(query.status as OrderStatus)
    ? (query.status as OrderStatus)
    : undefined;
  const number = query.number?.trim().toUpperCase() ?? '';
  const page = Math.max(Number.parseInt(query.page ?? '1', 10) || 1, 1);
  const [t, locale, format, list] = await Promise.all([
    getTranslations(),
    getLocale() as Promise<Locale>,
    getFormatter(),
    getAdminOrders({ ...(status ? { status } : {}), ...(number ? { number } : {}), page }),
  ]);
  const href = (s: string | undefined, p = 1) =>
    `/admin/orders?${new URLSearchParams({
      ...(s ? { status: s } : {}),
      ...(p > 1 ? { page: String(p) } : {}),
    }).toString()}`;

  return (
    <div className="flex flex-col gap-4">
      <form className="flex flex-col gap-2 sm:flex-row sm:items-end" role="search">
        <div className="flex flex-col gap-1.5 sm:w-72">
          <label htmlFor="order-number" className="text-sm font-medium">
            {t('admin.orderNumber')}
          </label>
          <Input
            id="order-number"
            name="number"
            defaultValue={number}
            autoCapitalize="characters"
          />
        </div>
        <Button type="submit">{t('admin.search')}</Button>
      </form>
      <StatusFilter
        label={t('admin.tabOrders')}
        current={status}
        options={[undefined, ...ORDER_STATUSES].map((s) => ({
          value: s,
          label: s ? t(`orders.status_${s}`) : t('admin.all'),
          href: href(s),
        }))}
      />
      {!list || list.items.length === 0 ? (
        <EmptyState icon={<Package />} title={t('admin.empty')} />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {list.items.map((order) => (
            <li key={order.number}>
              <Link
                href={`/admin/orders/${order.number}`}
                className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-muted/50"
              >
                <span className="flex flex-col gap-1">
                  <span className="font-semibold">{order.number}</span>
                  <span className="text-sm text-muted-foreground">
                    {format.dateTime(new Date(order.createdAt), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </span>
                <span className="text-sm tabular-nums">{formatPhone(order.customerPhone)}</span>
                <span className="text-sm">{t('admin.stores', { count: order.storeCount })}</span>
                <OrderStatusBadge status={order.status} />
                <span className="font-semibold">
                  <Price value={order.totalTiyin} locale={locale} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {list ? (
        <Pagination
          page={list.page}
          pageCount={Math.ceil(list.total / list.pageSize)}
          linkAs={Link}
          hrefFor={(p) => href(status, p)}
          labels={{
            nav: t('pagination.nav'),
            previous: t('pagination.previous'),
            next: t('pagination.next'),
            page: (p) => t('pagination.page', { page: p }),
          }}
        />
      ) : null}
    </div>
  );
}
