'use client';

import {
  type CartView,
  cartResponseSchema,
  type CurrentUser,
  type DeliveryQuote,
  type DeliveryType,
  deliveryQuoteSchema,
  orderResponseSchema,
  type PaymentMethod,
  type PickupPoint,
  PROMO_CODE_PATTERN,
  pickupPointsResponseSchema,
  type Region,
} from '@uzgo/contracts';
import { Button } from '@uzgo/ui/components/button';
import { EmptyState } from '@uzgo/ui/components/empty-state';
import { Input } from '@uzgo/ui/components/input';
import { Price } from '@uzgo/ui/components/price';
import { formatPrice } from '@uzgo/ui/lib/money';
import { Skeleton } from '@uzgo/ui/components/skeleton';
import { Banknote, CreditCard, FlaskConical, ShoppingCart } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { DistrictPicker } from '@/components/geo/district-picker';
import { Link, useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { ApiClientError, apiClient } from '@/lib/api-client';
import { emitCartChanged } from '@/lib/cart-events';
import { formatPhone } from '@/lib/format-phone';

const KNOWN_ERRORS = new Set([
  'OUT_OF_STOCK',
  'CART_HAS_ISSUES',
  'CART_EMPTY',
  'INVALID_PHONE',
  'VALIDATION_FAILED',
  'FISCAL_DATA_MISSING',
  'DELIVERY_UNAVAILABLE',
  'PAYMENT_METHOD_UNAVAILABLE',
  'TOO_MANY_UNPAID_ORDERS',
]);

const METHOD_ICON: Record<PaymentMethod, typeof Banknote> = {
  CASH_ON_DELIVERY: Banknote,
  PAYME: CreditCard,
  CLICK: CreditCard,
  DEV_ONLINE: FlaskConical,
};

export function CheckoutForm({
  user,
  regions,
  methods,
  paymentWindowMinutes,
}: {
  user: CurrentUser;
  regions: Region[];
  methods: PaymentMethod[];
  paymentWindowMinutes: number;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const ids = {
    name: useId(),
    phone: useId(),
    line: useId(),
    comment: useId(),
    error: useId(),
    point: useId(),
    promo: useId(),
  };
  // One key per checkout attempt: retries (double clicks, network errors) cannot create a second order.
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  const [cart, setCart] = useState<CartView | null>(null);
  const [name, setName] = useState(
    [user.profile.firstName, user.profile.lastName].filter(Boolean).join(' '),
  );
  const [phone, setPhone] = useState(formatPhone(user.phone));
  const [place, setPlace] = useState({
    regionId: user.profile.regionId ?? '',
    districtId: user.profile.districtId ?? '',
  });
  const [line, setLine] = useState('');
  const [comment, setComment] = useState('');
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('COURIER');
  const [points, setPoints] = useState<PickupPoint[]>([]);
  const [pointId, setPointId] = useState('');
  const [quote, setQuote] = useState<DeliveryQuote | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('CASH_ON_DELIVERY');
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  /** Typed promo code and the one sent to the quote (server decides if it applies). */
  const [promoInput, setPromoInput] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [promoMalformed, setPromoMalformed] = useState(false);

  async function loadCart() {
    const next = cartResponseSchema.parse(await apiClient('/cart')).cart;
    setCart(next);
    return next;
  }

  useEffect(() => {
    apiClient('/cart')
      .then((json) => {
        setCart(cartResponseSchema.parse(json).cart);
      })
      .catch(() => {
        setError(t('auth.error_generic'));
      });
  }, [t]);

  // Pickup points of the chosen district.
  useEffect(() => {
    if (!place.districtId || deliveryType !== 'PICKUP') return;
    let cancelled = false;
    void apiClient(`/delivery/pickup-points?districtId=${place.districtId}`)
      .then((json) => {
        if (!cancelled) setPoints(pickupPointsResponseSchema.parse(json).items);
      })
      .catch(() => {
        if (!cancelled) setPoints([]);
      });
    return () => {
      cancelled = true;
    };
  }, [place.districtId, deliveryType]);

  // The server prices delivery with the same rules checkout applies.
  const quoteKey = `${place.districtId}|${deliveryType}|${pointId}|${cart?.totalTiyin ?? ''}|${promoCode}`;
  useEffect(() => {
    const [districtId, type, point, , promo] = quoteKey.split('|');
    if (!districtId || (type === 'PICKUP' && !point)) return;
    let cancelled = false;
    const query = new URLSearchParams({ districtId, type: type ?? 'COURIER' });
    if (type === 'PICKUP' && point) query.set('pickupPointId', point);
    if (promo) query.set('promoCode', promo);
    void apiClient(`/delivery/quote?${query.toString()}`)
      .then((json) => {
        if (!cancelled) setQuote(deliveryQuoteSchema.parse(json));
      })
      .catch(() => {
        if (!cancelled) setQuote(null);
      });
    return () => {
      cancelled = true;
    };
  }, [quoteKey]);

  const quoteReady =
    quote !== null && place.districtId !== '' && (deliveryType === 'COURIER' || pointId !== '');
  const total = quoteReady ? quote.totalTiyin : (cart?.totalTiyin ?? '0');
  const appliedPromo = quoteReady ? quote.promo : null;
  const promoMessage = promoMalformed
    ? t('checkout.promo_PROMO_INVALID')
    : promoCode === ''
      ? null
      : quoteReady && quote.promoError
        ? quote.promoError === 'PROMO_MIN_ORDER' && quote.promoMinOrderTiyin
          ? t('checkout.promo_PROMO_MIN_ORDER', {
              amount: formatPrice(quote.promoMinOrderTiyin, locale),
            })
          : t(`checkout.promo_${quote.promoError}`)
        : !quoteReady
          ? t('checkout.promoAfterAddress')
          : null;

  function applyPromo() {
    const code = promoInput.trim().toUpperCase();
    const valid = PROMO_CODE_PATTERN.test(code);
    setPromoMalformed(code !== '' && !valid);
    setPromoCode(valid ? code : '');
  }

  async function goToPayment(number: string) {
    setRedirecting(true);
    const { url } = await apiClient<{ url: string }>(
      `/orders/${number}/payment-link?locale=${locale}`,
    );
    window.location.assign(url);
  }

  async function placeOrder() {
    if (!cart) return;
    setPending(true);
    setError(null);
    try {
      const json = await apiClient('/checkout', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey.current },
        body: {
          recipientName: name.trim(),
          recipientPhone: phone,
          districtId: place.districtId,
          deliveryType,
          ...(deliveryType === 'COURIER'
            ? { addressLine: line.trim() }
            : { pickupPointId: pointId }),
          ...(comment.trim() ? { comment: comment.trim() } : {}),
          paymentMethod: method,
          ...(appliedPromo ? { promoCode: appliedPromo.code } : {}),
          expectedTotalTiyin: total,
        },
      });
      const { order } = orderResponseSchema.parse(json);
      emitCartChanged({
        ...cart,
        groups: [],
        itemCount: 0,
        subtotalTiyin: '0',
        totalTiyin: '0',
        hasIssues: false,
      });
      if (method === 'CASH_ON_DELIVERY') {
        router.replace({ pathname: `/orders/${order.number}`, query: { placed: '1' } });
        return;
      }
      try {
        await goToPayment(order.number);
      } catch {
        // The order exists; payment can be retried from its page.
        router.replace({ pathname: `/orders/${order.number}`, query: { placed: '1' } });
      }
    } catch (err) {
      const code = err instanceof ApiClientError ? err.code : '';
      if (code === 'PRICE_CHANGED') {
        await loadCart();
        setQuote(null);
        setError(t('checkout.priceChanged'));
      } else if (code.startsWith('PROMO_')) {
        // The code stopped applying (limit reached, expired): show the new total.
        setQuote(null);
        setPromoCode('');
        setError(t('checkout.promoChanged'));
      } else {
        setError(KNOWN_ERRORS.has(code) ? t(`checkout.error_${code}`) : t('auth.error_generic'));
      }
      // A failed attempt created nothing, so the next attempt gets a fresh key.
      idempotencyKey.current = crypto.randomUUID();
      setPending(false);
    }
  }

  if (!cart) {
    return (
      <div role="status" className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <span className="sr-only">{t('states.loading')}</span>
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }
  if (cart.itemCount === 0) {
    return (
      <EmptyState
        icon={<ShoppingCart />}
        title={t('cart.emptyTitle')}
        description={t('cart.emptyDescription')}
        action={
          <Button asChild>
            <Link href="/catalog">{t('cart.cta')}</Link>
          </Button>
        }
      />
    );
  }

  const ready =
    name.trim().length >= 2 &&
    place.districtId !== '' &&
    (deliveryType === 'PICKUP' ? pointId !== '' : line.trim().length >= 5) &&
    quoteReady &&
    quote.available &&
    !cart.hasIssues;

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && !pending) void placeOrder();
      }}
      className="grid gap-6 lg:grid-cols-[1fr_22rem]"
    >
      <div className="flex flex-col gap-6">
        <section className="rounded-xl border border-border bg-card p-5" aria-labelledby="delivery">
          <h2 id="delivery" className="mb-4 text-lg font-semibold">
            {t('checkout.deliveryTitle')}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.name} className="text-sm font-medium">
                {t('checkout.recipientName')}
              </label>
              <Input
                id={ids.name}
                autoComplete="name"
                required
                maxLength={100}
                value={name}
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
                type="tel"
                autoComplete="tel"
                required
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                }}
              />
            </div>
            <DistrictPicker
              regions={regions}
              regionId={place.regionId}
              districtId={place.districtId}
              onChange={setPlace}
            />
            <fieldset className="flex flex-col gap-2 sm:col-span-2">
              <legend className="mb-1 text-sm font-medium">{t('checkout.deliveryType')}</legend>
              {(['COURIER', 'PICKUP'] as const).map((type) => (
                <label
                  key={type}
                  className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 text-sm has-checked:border-primary has-checked:bg-secondary"
                >
                  <input
                    type="radio"
                    name="deliveryType"
                    value={type}
                    checked={deliveryType === type}
                    onChange={() => {
                      setDeliveryType(type);
                      setPointId('');
                      setQuote(null);
                    }}
                    className="size-4 accent-(--primary)"
                  />
                  {type === 'COURIER' ? t('checkout.courier') : t('checkout.pickup')}
                </label>
              ))}
            </fieldset>
            {deliveryType === 'COURIER' ? (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label htmlFor={ids.line} className="text-sm font-medium">
                  {t('checkout.addressLine')}
                </label>
                <Input
                  id={ids.line}
                  autoComplete="street-address"
                  required
                  maxLength={200}
                  value={line}
                  onChange={(e) => {
                    setLine(e.target.value);
                  }}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label htmlFor={ids.point} className="text-sm font-medium">
                  {t('checkout.pickupPoint')}
                </label>
                {place.districtId && points.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('checkout.noPickupPoints')}</p>
                ) : (
                  <select
                    id={ids.point}
                    value={pointId}
                    onChange={(e) => {
                      setPointId(e.target.value);
                    }}
                    className="h-11 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="" disabled>
                      {t('checkout.selectPickup')}
                    </option>
                    {points.map((point) => (
                      <option key={point.id} value={point.id}>
                        {[point.name[locale], point.address, point.hours]
                          .filter(Boolean)
                          .join(' · ')}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
            {quote && !quote.available ? (
              <p role="alert" className="text-sm font-medium text-destructive sm:col-span-2">
                {t('checkout.deliveryUnavailable')}
              </p>
            ) : null}
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label htmlFor={ids.comment} className="text-sm font-medium">
                {t('checkout.comment')}
              </label>
              <textarea
                id={ids.comment}
                maxLength={500}
                rows={3}
                value={comment}
                onChange={(e) => {
                  setComment(e.target.value);
                }}
                className="rounded-md border border-input bg-background px-3 py-2 text-base focus-visible:border-ring md:text-sm"
              />
            </div>
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card p-5" aria-labelledby="payment">
          <h2 id="payment" className="mb-4 text-lg font-semibold">
            {t('checkout.paymentTitle')}
          </h2>
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">{t('checkout.paymentTitle')}</legend>
            {methods.map((m) => {
              const Icon = METHOD_ICON[m];
              return (
                <label
                  key={m}
                  className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 text-sm font-medium has-checked:border-primary has-checked:bg-secondary"
                >
                  <input
                    type="radio"
                    name="payment"
                    value={m}
                    checked={method === m}
                    onChange={() => {
                      setMethod(m);
                    }}
                    className="size-4 accent-(--primary)"
                  />
                  <Icon aria-hidden="true" className="size-5" />
                  {t(`checkout.method_${m}`)}
                </label>
              );
            })}
          </fieldset>
          {method !== 'CASH_ON_DELIVERY' ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {t('checkout.onlineNote', { minutes: paymentWindowMinutes })}
            </p>
          ) : null}
        </section>
      </div>
      <aside className="h-fit rounded-xl border border-border bg-card p-5 lg:sticky lg:top-40">
        <h2 className="mb-4 text-lg font-semibold">{t('cart.summary')}</h2>
        <ul className="mb-4 flex flex-col gap-2 text-sm">
          {cart.groups
            .flatMap((g) => g.lines)
            .map((l) => (
              <li key={l.variantId} className="flex justify-between gap-3">
                <span className="line-clamp-2">
                  {l.title[locale]} × {l.quantity}
                </span>
                <Price value={l.lineTotalTiyin} locale={locale} className="shrink-0 font-normal" />
              </li>
            ))}
        </ul>
        <p className="mb-3 text-xs text-muted-foreground">
          {t('checkout.shipmentsNote', { count: cart.groups.length })}
        </p>
        <div className="mb-3 flex flex-col gap-1.5">
          <label htmlFor={ids.promo} className="text-sm font-medium">
            {t('checkout.promoLabel')}
          </label>
          <div className="flex gap-2">
            <Input
              id={ids.promo}
              value={promoInput}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={32}
              onChange={(event) => {
                setPromoInput(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  applyPromo();
                }
              }}
              aria-describedby={`${ids.promo}-status`}
              data-testid="promo-input"
            />
            {promoCode && promoInput.trim().toUpperCase() === promoCode ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPromoInput('');
                  setPromoCode('');
                  setPromoMalformed(false);
                }}
              >
                {t('checkout.promoRemove')}
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={applyPromo}>
                {t('checkout.promoApply')}
              </Button>
            )}
          </div>
          <p id={`${ids.promo}-status`} aria-live="polite" className="text-xs">
            {appliedPromo ? (
              <span className="text-success">
                {appliedPromo.description ?? t('checkout.promoApplied')}
              </span>
            ) : promoMessage ? (
              <span className="text-destructive">{promoMessage}</span>
            ) : null}
          </p>
        </div>
        <dl className="mb-3 flex flex-col gap-1 text-sm">
          <div className="flex justify-between">
            <dt>{t('checkout.itemsLine')}</dt>
            <dd>
              <Price value={cart.totalTiyin} locale={locale} className="font-normal" />
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>{t('checkout.deliveryLine')}</dt>
            <dd data-testid="checkout-delivery" className="text-right">
              {!quoteReady ? null : quote.deliveryTotalTiyin !== '0' ? (
                <Price value={quote.deliveryTotalTiyin} locale={locale} className="font-normal" />
              ) : deliveryType === 'COURIER' && quote.etaDays === null ? (
                t('checkout.deliveryAgreed')
              ) : (
                t('checkout.deliveryFree')
              )}
            </dd>
          </div>
          {appliedPromo && quote && quote.discountTiyin !== '0' ? (
            <div
              className="flex justify-between gap-3 text-success"
              data-testid="checkout-discount"
            >
              <dt>{t('checkout.discountLine', { code: appliedPromo.code })}</dt>
              <dd>
                {t('checkout.discountAmount', { amount: formatPrice(quote.discountTiyin, locale) })}
              </dd>
            </div>
          ) : null}
          {quoteReady && quote.etaDays ? (
            <p className="text-xs text-muted-foreground">
              {t('checkout.eta', { min: quote.etaDays.min, max: quote.etaDays.max })}
            </p>
          ) : null}
        </dl>
        <div className="flex justify-between border-t border-border pt-3">
          <span className="font-semibold">{t('cart.total')}</span>
          <span data-testid="checkout-total">
            <Price value={total} locale={locale} className="text-lg font-bold" />
          </span>
        </div>
        {error ? (
          <p id={ids.error} role="alert" className="mt-3 text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          size="lg"
          variant="accent"
          className="mt-4 w-full"
          disabled={!ready || pending}
        >
          {redirecting ? t('checkout.redirecting') : t('checkout.placeOrder')}
        </Button>
      </aside>
    </form>
  );
}
