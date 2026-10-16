'use client';

import type { AdminRestaurant, RestaurantOrder, SellerOrderStatus } from '@uzgo/contracts';
import { Badge } from '@uzgo/ui/components/badge';
import { Button } from '@uzgo/ui/components/button';
import { Price } from '@uzgo/ui/components/price';
import { toast } from '@uzgo/ui/components/toast';
import { formatPrice } from '@uzgo/ui/lib/money';
import { Phone } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useErrorMessage } from '@/components/panel/use-error-message';
import { useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { apiClient } from '@/lib/api-client';
import { formatPhone } from '@/lib/format-phone';

const NEGATIVE = new Set<SellerOrderStatus>(['CANCELLED_BY_SELLER', 'DELIVERY_FAILED']);

function OrderCard({ order }: { order: RestaurantOrder }) {
  const t = useTranslations('food');
  const locale = useLocale() as Locale;
  const format = useFormatter();
  const router = useRouter();
  const errorMessage = useErrorMessage('seller');
  const [pending, setPending] = useState(false);

  async function move(to: SellerOrderStatus) {
    if (NEGATIVE.has(to) && !window.confirm(t('confirmAction', { action: t(`action_${to}`) }))) {
      return;
    }
    setPending(true);
    try {
      await apiClient(`/seller/seller-orders/${order.id}/transition`, {
        method: 'POST',
        body: { to },
      });
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  const time = (iso: string) =>
    format.dateTime(new Date(iso), { timeStyle: 'short', timeZone: 'Asia/Tashkent' });
  return (
    <li
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
      data-testid="restaurant-order"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{order.orderNumber}</span>
        <Badge variant={order.status === 'NEW' ? 'sale' : 'secondary'}>
          {t(`ss_${order.status}`)}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        {time(order.createdAt)}
        {order.acceptBy ? ` · ${t('acceptBy', { time: time(order.acceptBy) })}` : ''}
      </p>
      <ul className="flex flex-col gap-0.5 text-sm">
        {order.items.map((item, index) => (
          <li key={`${item.name.uz}-${String(index)}`} className="flex justify-between gap-3">
            <span>{t('line', { name: item.name[locale], quantity: item.quantity })}</span>
            <Price value={item.lineTotalTiyin} locale={locale} className="font-normal" />
          </li>
        ))}
      </ul>
      <dl className="grid gap-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">{t('payment')}</dt>
          <dd>{t(`pay_${order.paymentMethod === 'CASH_ON_DELIVERY' ? 'cash' : 'online'}`)}</dd>
        </div>
        {order.collectTiyin ? (
          <div className="flex justify-between font-semibold">
            <dt>{t('collect')}</dt>
            <dd>{formatPrice(order.collectTiyin, locale)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between">
          <dt className="text-muted-foreground">{t('delivery')}</dt>
          <dd>{t(`mode_${order.deliveryMode}`)}</dd>
        </div>
      </dl>
      {order.deliveryMode === 'SELF' ? (
        <div className="text-sm">
          <p>
            {order.recipientName} ·{' '}
            <a href={`tel:${order.recipientPhone}`} className="underline">
              {formatPhone(order.recipientPhone)}
            </a>
          </p>
          <p className="text-muted-foreground">{order.addressLine}</p>
        </div>
      ) : order.courier ? (
        <p className="flex items-center gap-2 text-sm">
          {t('courierLine', { name: order.courier.name ?? t('courier') })}
          <a
            href={`tel:${order.courier.phone}`}
            className="inline-flex items-center gap-1 underline"
          >
            <Phone aria-hidden="true" className="size-3.5" />
            {order.courier.phone}
          </a>
        </p>
      ) : order.status === 'ACCEPTED' || order.status === 'PACKED' ? (
        <p className="text-sm text-muted-foreground">{t('waitingCourier')}</p>
      ) : null}
      {order.comment ? <p className="rounded-md bg-muted/50 p-2 text-sm">{order.comment}</p> : null}
      {order.allowedTransitions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {order.allowedTransitions.map((to) => (
            <Button
              key={to}
              size="sm"
              variant={NEGATIVE.has(to) ? 'outline' : 'primary'}
              disabled={pending}
              onClick={() => void move(to)}
            >
              {t(`action_${to}`)}
            </Button>
          ))}
        </div>
      ) : null}
    </li>
  );
}

/** Kitchen screen: live orders, pause intake, dishes sold out today. */
export function RestaurantBoard({
  restaurant,
  orders,
  scope,
}: {
  restaurant: AdminRestaurant;
  orders: RestaurantOrder[];
  scope: 'active' | 'all';
}) {
  const t = useTranslations('food');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const errorMessage = useErrorMessage('seller');
  const [pending, setPending] = useState(false);

  async function call(path: string, body: object) {
    setPending(true);
    try {
      await apiClient(`/restaurant/${restaurant.id}${path}`, { method: 'PATCH', body });
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <section aria-labelledby="orders" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="orders" className="text-lg font-semibold">
            {t('ordersTitle')}
          </h2>
          <div className="flex gap-1">
            {(['active', 'all'] as const).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={scope === s ? 'primary' : 'outline'}
                onClick={() => {
                  router.replace({ pathname: `/restaurant/${restaurant.id}`, query: { scope: s } });
                }}
              >
                {t(`scope_${s}`)}
              </Button>
            ))}
          </div>
        </div>
        {orders.length === 0 ? (
          <p className="text-muted-foreground">{t('noOrders')}</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {orders.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))}
          </ul>
        )}
      </section>
      <aside className="flex flex-col gap-4">
        <section className="rounded-xl border border-border bg-card p-4">
          <p className="mb-2 text-sm">
            {restaurant.acceptingOrders ? t('accepting') : t('paused')}
          </p>
          <Button
            variant={restaurant.acceptingOrders ? 'outline' : 'primary'}
            disabled={pending}
            onClick={() => void call('/settings', { acceptingOrders: !restaurant.acceptingOrders })}
            data-testid="pause-toggle"
          >
            {restaurant.acceptingOrders ? t('pause') : t('resume')}
          </Button>
        </section>
        <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="stoplist">
          <h2 id="stoplist" className="mb-2 font-semibold">
            {t('stopList')}
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {restaurant.menu
              .flatMap((c) => c.items)
              .filter((i) => !i.archived)
              .map((item) => (
                <li key={item.id}>
                  <label className="flex items-center justify-between gap-2">
                    <span className={item.available ? '' : 'text-muted-foreground line-through'}>
                      {item.name[locale]}
                    </span>
                    <input
                      type="checkbox"
                      checked={item.available}
                      disabled={pending}
                      onChange={() =>
                        void call(`/menu-items/${item.id}`, { available: !item.available })
                      }
                      aria-label={t('availableLabel', { name: item.name[locale] })}
                    />
                  </label>
                </li>
              ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
