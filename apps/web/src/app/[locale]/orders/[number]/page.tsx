import { Badge } from '@uzgo/ui/components/badge';
import { Price } from '@uzgo/ui/components/price';
import { CircleCheck, Store } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { Breadcrumbs } from '@/components/catalog/breadcrumbs';
import { OrderStatusBadge } from '@/components/orders/status-badge';
import { ShipmentActions } from '@/components/orders/shipment-actions';
import { Link, redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { getCurrentUser, getMyOrder } from '@/lib/api-server';
import { formatPhone } from '@/lib/format-phone';

type Props = {
  params: Promise<{ number: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ number }, t] = await Promise.all([params, getTranslations('orders')]);
  return { title: t('number', { number }), robots: { index: false } };
}

export default async function OrderPage({ params, searchParams }: Props) {
  const [{ number }, query, t, locale, format] = await Promise.all([
    params,
    searchParams,
    getTranslations(),
    getLocale(),
    getFormatter(),
  ]);
  const l = locale as Locale;
  if (!(await getCurrentUser())) {
    redirect({ href: { pathname: '/login', query: { next: `/orders/${number}` } }, locale });
  }
  const order = /^UZ-\d{4}-\d{6,}$/.test(number) ? await getMyOrder(number) : null;
  if (!order) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <Breadcrumbs
        items={[{ href: '/orders', label: t('orders.title') }, { label: order.number }]}
      />
      {query.placed === '1' ? (
        <div
          role="status"
          className="mb-6 flex gap-3 rounded-xl border border-success/30 bg-success/10 p-4"
        >
          <CircleCheck aria-hidden="true" className="size-6 shrink-0 text-success" />
          <div>
            <p className="font-semibold">{t('orders.placed')}</p>
            <p className="text-sm text-muted-foreground">{t('orders.placedText')}</p>
          </div>
        </div>
      ) : null}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold md:text-3xl">
          {t('orders.number', { number: order.number })}
        </h1>
        <OrderStatusBadge status={order.status} />
      </div>
      <p className="-mt-4 mb-6 text-sm text-muted-foreground">
        {format.dateTime(new Date(order.createdAt), { dateStyle: 'long', timeStyle: 'short' })}
      </p>
      <div className="flex flex-col gap-4">
        {order.sellerOrders.map((so) => (
          <section
            key={so.id}
            className="rounded-xl border border-border bg-card"
            aria-label={t('orders.shipment', { number: so.number })}
          >
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Store aria-hidden="true" className="size-4 text-muted-foreground" />
                <Link href={`/s/${so.store.slug}`} className="hover:underline">
                  {so.store.name[l]}
                </Link>
                <span className="font-normal text-muted-foreground">· {so.number}</span>
              </div>
              <Badge variant="outline" data-testid="shipment-status">
                {t(`orders.ss_${so.status}`)}
              </Badge>
            </header>
            <ul className="divide-y divide-border">
              {so.items.map((item) => (
                <li key={item.sku} className="flex justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <Link
                      href={`/p/${item.productSlug}`}
                      className="font-medium hover:text-primary"
                    >
                      {item.title[l]}
                    </Link>
                    <p className="text-muted-foreground">
                      {[...item.options.map((o) => o[l]), `× ${String(item.quantity)}`].join(' · ')}
                    </p>
                  </div>
                  <Price value={item.lineTotalTiyin} locale={l} className="shrink-0" />
                </li>
              ))}
            </ul>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
              <ShipmentActions
                orderNumber={order.number}
                sellerOrderId={so.id}
                allowed={so.allowedTransitions}
              />
              <Price value={so.totalTiyin} locale={l} className="ml-auto" />
            </footer>
          </section>
        ))}
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4 text-sm">
          <h2 className="mb-2 font-semibold">{t('orders.address')}</h2>
          <p>{order.address.recipientName}</p>
          <p className="text-muted-foreground">{formatPhone(order.address.recipientPhone)}</p>
          <p className="text-muted-foreground">
            {[order.address.region[l], order.address.district[l], order.address.line].join(', ')}
          </p>
          {order.address.comment ? (
            <p className="mt-1 text-muted-foreground">{order.address.comment}</p>
          ) : null}
        </section>
        <section className="rounded-xl border border-border bg-card p-4 text-sm">
          <h2 className="mb-2 font-semibold">{t('orders.payment')}</h2>
          <p className="text-muted-foreground">{t('checkout.cod')}</p>
          <div className="mt-3 flex justify-between border-t border-border pt-3 text-base">
            <span className="font-semibold">{t('orders.total')}</span>
            <Price value={order.totalTiyin} locale={l} className="font-bold" />
          </div>
        </section>
      </div>
    </div>
  );
}
