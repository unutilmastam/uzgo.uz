import { EmptyState } from '@uzgo/ui/components/empty-state';
import { Price } from '@uzgo/ui/components/price';
import { Package } from 'lucide-react';
import type { Metadata } from 'next';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { ShipmentButtons } from '@/components/seller/shipment-buttons';
import type { Locale } from '@/i18n/routing';
import { formatPhone } from '@/lib/format-phone';
import { getSellerShipments } from '@/lib/seller-api';
import { loadSellerStore } from '../store-context';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('seller');
  return { title: t('orders'), robots: { index: false } };
}

/** Shipments of this store. Customer contact data is shown only to store members. */
export default async function SellerOrdersPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const { store } = await loadSellerStore(storeId, `/seller/${storeId}/orders`);
  const [t, locale, format, shipments] = await Promise.all([
    getTranslations(),
    getLocale() as Promise<Locale>,
    getFormatter(),
    getSellerShipments(store.id),
  ]);
  if (shipments.length === 0) {
    return <EmptyState icon={<Package />} title={t('seller.noOrders')} />;
  }
  return (
    <ul className="flex flex-col gap-4">
      {shipments.map((shipment) => (
        <li key={shipment.id} className="rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col">
              <span className="font-semibold">
                {t('orders.shipment', { number: shipment.number })}
              </span>
              <span className="text-sm text-muted-foreground">
                {format.dateTime(new Date(shipment.createdAt), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </span>
            </div>
            <span className="rounded-full bg-secondary px-3 py-1 text-sm font-medium">
              {t(`orders.ss_${shipment.status}`)}
            </span>
          </div>
          <ul className="mb-3 flex flex-col gap-1 text-sm">
            {shipment.items.map((item) => (
              <li key={`${item.sku}-${item.productSlug}`} className="flex justify-between gap-3">
                <span>
                  {item.options.length > 0
                    ? t('seller.itemLineOptions', {
                        title: item.title[locale],
                        options: item.options.map((o) => o[locale]).join(', '),
                        quantity: item.quantity,
                      })
                    : t('seller.itemLine', { title: item.title[locale], quantity: item.quantity })}
                </span>
                <Price value={item.lineTotalTiyin} locale={locale} />
              </li>
            ))}
          </ul>
          <dl className="mb-3 grid gap-1 text-sm sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="text-muted-foreground">{t('seller.recipient')}</dt>
              <dd>
                {t('seller.recipientValue', {
                  name: shipment.recipientName,
                  phone: formatPhone(shipment.recipientPhone),
                })}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">{t('orders.address')}</dt>
              <dd>
                {t('seller.addressValue', {
                  district: shipment.district[locale],
                  line: shipment.addressLine,
                })}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">{t('orders.total')}</dt>
              <dd className="font-semibold">
                <Price value={shipment.totalTiyin} locale={locale} />
              </dd>
            </div>
          </dl>
          <ShipmentButtons sellerOrderId={shipment.id} allowed={shipment.allowedTransitions} />
        </li>
      ))}
    </ul>
  );
}
