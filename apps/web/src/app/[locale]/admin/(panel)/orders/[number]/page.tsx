import { Price } from '@uzgo/ui/components/price';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { AdminAction } from '@/components/admin/admin-action';
import { OrderStatusBadge } from '@/components/orders/status-badge';
import type { Locale } from '@/i18n/routing';
import { getAdminOrder } from '@/lib/admin-api';
import { formatPhone } from '@/lib/format-phone';
import { requireStaff } from '../../../staff';

export default async function AdminOrderPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  if (!/^UZ-\d{4}-\d{6}$/.test(number)) notFound();
  await requireStaff(`/admin/orders/${number}`, 'admin');
  const [t, locale, order] = await Promise.all([
    getTranslations(),
    getLocale() as Promise<Locale>,
    getAdminOrder(number),
  ]);
  if (!order) notFound();

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">{t('orders.number', { number: order.number })}</h2>
        <OrderStatusBadge status={order.status} />
        <span className="ml-auto font-semibold">
          <Price value={order.totalTiyin} locale={locale} />
        </span>
      </div>
      <p className="text-sm">
        {t('seller.recipientValue', {
          name: order.address.recipientName,
          phone: formatPhone(order.address.recipientPhone),
        })}
      </p>
      <p className="text-sm text-muted-foreground">
        {t('seller.addressValue', {
          district: `${order.address.region[locale]}, ${order.address.district[locale]}`,
          line: order.address.line,
        })}
      </p>
      <ul className="flex flex-col gap-3">
        {order.sellerOrders.map((shipment) => (
          <li key={shipment.id} className="rounded-xl border border-border bg-card p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">
                {t('orders.shipment', { number: shipment.number })}
              </span>
              <span className="text-sm">{shipment.store.name[locale]}</span>
              <span
                className="rounded-full bg-secondary px-3 py-1 text-sm font-medium"
                data-testid="admin-shipment-status"
              >
                {t(`orders.ss_${shipment.status}`)}
              </span>
            </div>
            <ul className="mb-3 flex flex-col gap-1 text-sm">
              {shipment.items.map((item) => (
                <li key={`${item.sku}-${item.productSlug}`} className="flex justify-between gap-3">
                  <span>
                    {t('seller.itemLine', { title: item.title[locale], quantity: item.quantity })}
                  </span>
                  <Price value={item.lineTotalTiyin} locale={locale} />
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-start gap-2">
              {shipment.allowedTransitions.map((to) => (
                <AdminAction
                  key={to}
                  path={`/admin/orders/${order.number}/seller-orders/${shipment.id}/transition`}
                  body={{ to }}
                  label={t.has(`seller.action_${to}`) ? t(`seller.action_${to}`) : to}
                />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
