'use client';

import {
  type CurrentUser,
  type FoodQuote,
  foodQuoteSchema,
  orderResponseSchema,
  type PaymentMethod,
  type RestaurantDetail,
} from '@uzgo/contracts';
import { Button } from '@uzgo/ui/components/button';
import { Input } from '@uzgo/ui/components/input';
import { Price } from '@uzgo/ui/components/price';
import { formatPrice } from '@uzgo/ui/lib/money';
import { Minus, Plus, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { FormError, Textarea } from '@/components/panel/form-controls';
import { Link, useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { ApiClientError, apiClient } from '@/lib/api-client';
import { formatPhone } from '@/lib/format-phone';
import { PointPicker } from './point-picker';
import { usePoint } from './use-point';

type Basket = Record<string, number>;
const MAX_QTY = 50;

function useBasket(restaurantId: string): [Basket, (next: Basket) => void] {
  const key = `uzgo:food:basket:${restaurantId}`;
  const [basket, setBasket] = useState<Basket>({});
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      if (parsed && typeof parsed === 'object') {
        const clean: Basket = {};
        for (const [id, qty] of Object.entries(parsed)) {
          if (typeof qty === 'number' && qty > 0) clean[id] = Math.min(MAX_QTY, Math.floor(qty));
        }
        // Restore the basket saved in this browser after hydration.
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of browser storage
        setBasket(clean);
      }
    } catch {
      // Storage unavailable: start empty.
    }
  }, [key]);
  const save = (next: Basket) => {
    setBasket(next);
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Keep it in memory only.
    }
  };
  return [basket, save];
}

/**
 * Menu, basket and checkout for one restaurant. Prices, fee, time and
 * availability always come from the server (quote), and checkout sends the
 * total the customer saw (ADR 0024).
 */
export function RestaurantOrdering({
  restaurant,
  user,
  methods,
}: {
  restaurant: RestaurantDetail;
  user: CurrentUser | null;
  methods: PaymentMethod[];
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const ids = { address: useId(), name: useId(), phone: useId(), comment: useId(), error: useId() };
  const [basket, setBasket] = useBasket(restaurant.id);
  const [point] = usePoint();
  const [quote, setQuote] = useState<FoodQuote | null>(null);
  const [addressLine, setAddressLine] = useState('');
  const [name, setName] = useState(user?.profile.firstName ?? '');
  const [phone, setPhone] = useState(user ? formatPhone(user.phone) : '');
  const [comment, setComment] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH_ON_DELIVERY');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ body: string; key: string } | null>(null);

  const dishes = restaurant.menu.flatMap((c) => c.items);
  const byId = new Map(dishes.map((d) => [d.id, d]));
  const lines = Object.entries(basket)
    .filter(([id, qty]) => qty > 0 && byId.has(id))
    .map(([menuItemId, quantity]) => ({ menuItemId, quantity }));
  const linesKey = JSON.stringify(lines);
  const localItems = lines.reduce(
    (sum, l) => sum + BigInt(byId.get(l.menuItemId)?.priceTiyin ?? '0') * BigInt(l.quantity),
    0n,
  );

  useEffect(() => {
    const parsed = JSON.parse(linesKey) as { menuItemId: string; quantity: number }[];
    if (!point || parsed.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no quote without a basket and a point
      setQuote(null);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      apiClient('/food/quote', {
        method: 'POST',
        body: { restaurantId: restaurant.id, items: parsed, lat: point.lat, lng: point.lng },
      }).then(
        (body) => {
          if (active) setQuote(foodQuoteSchema.parse(body));
        },
        () => {
          if (active) setQuote(null);
        },
      );
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [linesKey, point, restaurant.id]);

  const change = (id: string, delta: number) => {
    const qty = Math.max(0, Math.min(MAX_QTY, (basket[id] ?? 0) + delta));
    const next = Object.fromEntries(Object.entries(basket).filter(([key]) => key !== id));
    setBasket(qty > 0 ? { ...next, [id]: qty } : next);
  };

  async function placeOrder() {
    if (!quote?.available || !point || !user) return;
    const body = {
      restaurantId: restaurant.id,
      items: lines,
      lat: point.lat,
      lng: point.lng,
      addressLine: addressLine.trim(),
      ...(comment.trim() ? { comment: comment.trim() } : {}),
      recipientName: name.trim(),
      recipientPhone: phone,
      paymentMethod: method,
      expectedTotalTiyin: quote.totalTiyin,
    };
    // Same body → same Idempotency-Key: a retry can never create a second order.
    const serialized = JSON.stringify(body);
    if (attempt.current?.body !== serialized) {
      attempt.current = { body: serialized, key: crypto.randomUUID() };
    }
    setPending(true);
    setError(null);
    try {
      const { order } = orderResponseSchema.parse(
        await apiClient('/food/checkout', {
          method: 'POST',
          headers: { 'Idempotency-Key': attempt.current.key },
          body,
        }),
      );
      setBasket({});
      if (method === 'CASH_ON_DELIVERY') {
        router.replace({ pathname: `/orders/${order.number}`, query: { placed: '1' } });
        return;
      }
      try {
        const { url } = await apiClient<{ url: string }>(
          `/orders/${order.number}/payment-link?locale=${locale}`,
        );
        window.location.assign(url);
      } catch {
        router.replace({ pathname: `/orders/${order.number}`, query: { placed: '1' } });
      }
    } catch (err) {
      const code = err instanceof ApiClientError ? err.code : '';
      if (code === 'PRICE_CHANGED' || code === 'FOOD_UNAVAILABLE') {
        setQuote(null);
        setError(t('food.changed'));
        router.refresh();
      } else {
        setError(
          t.has(`checkout.error_${code}`) ? t(`checkout.error_${code}`) : t('auth.error_generic'),
        );
      }
      setPending(false);
    }
  }

  const ready =
    quote?.available === true &&
    addressLine.trim().length >= 3 &&
    name.trim().length >= 2 &&
    phone.trim().length >= 7;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
      <div className="flex flex-col gap-8">
        {restaurant.menu.map((category) => (
          <section key={category.id} aria-labelledby={`cat-${category.id}`}>
            <h2 id={`cat-${category.id}`} className="mb-3 text-lg font-semibold">
              {category.name[locale]}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {category.items.map((dish) => {
                const qty = basket[dish.id] ?? 0;
                return (
                  <li
                    key={dish.id}
                    className="flex gap-3 rounded-xl border border-border bg-card p-3"
                    data-testid="dish"
                  >
                    <div className="size-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {dish.image ? (
                        // eslint-disable-next-line @next/next/no-img-element -- object storage URLs
                        <img src={dish.image} alt="" className="size-full object-cover" />
                      ) : (
                        <div className="flex size-full items-center justify-center text-muted-foreground">
                          <UtensilsCrossed aria-hidden="true" className="size-6" />
                        </div>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <h3 className="font-medium">{dish.name[locale]}</h3>
                      {dish.description ? (
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {dish.description[locale]}
                        </p>
                      ) : null}
                      <div className="mt-auto flex items-center justify-between gap-2">
                        <Price value={dish.priceTiyin} locale={locale} />
                        {!dish.available ? (
                          <span className="text-xs text-muted-foreground">{t('food.soldOut')}</span>
                        ) : qty === 0 ? (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              change(dish.id, 1);
                            }}
                            aria-label={t('food.add', { name: dish.name[locale] })}
                          >
                            <Plus aria-hidden="true" className="size-4" />
                            {t('food.addShort')}
                          </Button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="outline"
                              aria-label={t('food.less', { name: dish.name[locale] })}
                              onClick={() => {
                                change(dish.id, -1);
                              }}
                            >
                              <Minus aria-hidden="true" className="size-4" />
                            </Button>
                            <span className="w-6 text-center tabular-nums" aria-live="polite">
                              {qty}
                            </span>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="outline"
                              aria-label={t('food.more', { name: dish.name[locale] })}
                              onClick={() => {
                                change(dish.id, 1);
                              }}
                            >
                              <Plus aria-hidden="true" className="size-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <aside
        className="flex h-fit flex-col gap-4 rounded-xl border border-border bg-card p-4 lg:sticky lg:top-24"
        aria-labelledby="basket"
      >
        <h2 id="basket" className="flex items-center gap-2 text-lg font-semibold">
          <ShoppingBag aria-hidden="true" className="size-5" />
          {t('food.basket')}
        </h2>
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('food.basketEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {lines.map((l) => {
              const dish = byId.get(l.menuItemId);
              return dish ? (
                <li key={l.menuItemId} className="flex justify-between gap-3">
                  <span>{t('food.line', { name: dish.name[locale], quantity: l.quantity })}</span>
                  <Price
                    value={(BigInt(dish.priceTiyin) * BigInt(l.quantity)).toString()}
                    locale={locale}
                    className="shrink-0 font-normal"
                  />
                </li>
              ) : null;
            })}
          </ul>
        )}

        <div className="border-t border-border pt-3">
          <h3 className="mb-2 text-sm font-semibold">{t('food.deliverTo')}</h3>
          <PointPicker compact />
        </div>

        {lines.length > 0 ? (
          <dl className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
            <div className="flex justify-between">
              <dt>{t('checkout.itemsLine')}</dt>
              <dd>
                <Price
                  value={quote?.itemsTotalTiyin ?? localItems.toString()}
                  locale={locale}
                  className="font-normal"
                />
              </dd>
            </div>
            {quote ? (
              <>
                <div className="flex justify-between">
                  <dt>{t('checkout.deliveryLine')}</dt>
                  <dd data-testid="food-delivery">
                    {quote.deliveryTiyin === '0'
                      ? t('food.freeDelivery')
                      : formatPrice(quote.deliveryTiyin, locale)}
                  </dd>
                </div>
                <div className="flex justify-between font-semibold">
                  <dt>{t('cart.total')}</dt>
                  <dd data-testid="food-total">
                    <Price value={quote.totalTiyin} locale={locale} />
                  </dd>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('food.etaMinutes', { minutes: quote.etaMinutes })}
                </p>
                {quote.reason ? (
                  <p
                    role="alert"
                    className="text-sm font-medium text-destructive"
                    data-testid="food-reason"
                  >
                    {quote.reason === 'MIN_ORDER'
                      ? t('food.reason_MIN_ORDER', {
                          amount: formatPrice(quote.minOrderTiyin, locale),
                        })
                      : t(`food.reason_${quote.reason}`)}
                  </p>
                ) : null}
              </>
            ) : point ? null : (
              <p className="text-xs text-muted-foreground">{t('food.pointForTotal')}</p>
            )}
          </dl>
        ) : null}

        {lines.length > 0 && !user ? (
          <Button asChild>
            <Link href={{ pathname: '/login', query: { next: `/food/${restaurant.slug}` } }}>
              {t('food.loginToOrder')}
            </Link>
          </Button>
        ) : null}

        {lines.length > 0 && user && quote?.available ? (
          <form
            className="flex flex-col gap-3 border-t border-border pt-3"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void placeOrder();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.address} className="text-sm font-medium">
                {t('food.addressLine')}
              </label>
              <Input
                id={ids.address}
                value={addressLine}
                maxLength={200}
                placeholder={t('food.addressLinePlaceholder')}
                onChange={(e) => {
                  setAddressLine(e.target.value);
                }}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="flex flex-col gap-1.5">
                <label htmlFor={ids.name} className="text-sm font-medium">
                  {t('checkout.recipientName')}
                </label>
                <Input
                  id={ids.name}
                  value={name}
                  autoComplete="name"
                  maxLength={100}
                  onChange={(e) => {
                    setName(e.target.value);
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={ids.phone} className="text-sm font-medium">
                  {t('checkout.recipientPhone')}
                </label>
                <Input
                  id={ids.phone}
                  value={phone}
                  type="tel"
                  autoComplete="tel"
                  maxLength={20}
                  onChange={(e) => {
                    setPhone(e.target.value);
                  }}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.comment} className="text-sm font-medium">
                {t('food.comment')}
              </label>
              <Textarea
                id={ids.comment}
                value={comment}
                maxLength={300}
                className="min-h-16"
                onChange={(e) => {
                  setComment(e.target.value);
                }}
              />
            </div>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-sm font-medium">{t('checkout.paymentTitle')}</legend>
              {methods.map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="food-payment"
                    value={m}
                    checked={method === m}
                    onChange={() => {
                      setMethod(m);
                    }}
                  />
                  {t(`checkout.method_${m}`)}
                </label>
              ))}
            </fieldset>
            <FormError id={ids.error} message={error} />
            <Button type="submit" size="lg" variant="accent" disabled={!ready || pending}>
              {t('food.placeOrder')}
            </Button>
          </form>
        ) : null}
        {error && !(lines.length > 0 && user && quote?.available) ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </aside>
    </div>
  );
}
