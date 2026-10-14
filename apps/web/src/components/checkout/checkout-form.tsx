'use client';

import {
  type CartView,
  cartResponseSchema,
  type CurrentUser,
  orderResponseSchema,
  type Region,
} from '@uzgo/contracts';
import { Button } from '@uzgo/ui/components/button';
import { EmptyState } from '@uzgo/ui/components/empty-state';
import { Input } from '@uzgo/ui/components/input';
import { Price } from '@uzgo/ui/components/price';
import { Skeleton } from '@uzgo/ui/components/skeleton';
import { Banknote, ShoppingCart } from 'lucide-react';
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
]);

export function CheckoutForm({ user, regions }: { user: CurrentUser; regions: Region[] }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const ids = { name: useId(), phone: useId(), line: useId(), comment: useId(), error: useId() };
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
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
          addressLine: line.trim(),
          ...(comment.trim() ? { comment: comment.trim() } : {}),
          paymentMethod: 'CASH_ON_DELIVERY',
          expectedTotalTiyin: cart.totalTiyin,
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
      router.replace({ pathname: `/orders/${order.number}`, query: { placed: '1' } });
    } catch (err) {
      const code = err instanceof ApiClientError ? err.code : '';
      if (code === 'PRICE_CHANGED') {
        await loadCart();
        setError(t('checkout.priceChanged'));
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
    line.trim().length >= 5 &&
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
          <label className="flex items-center gap-3 rounded-lg border border-primary bg-secondary px-4 py-3 text-sm font-medium text-secondary-foreground">
            <input
              type="radio"
              name="payment"
              checked
              readOnly
              className="size-4 accent-(--primary)"
            />
            <Banknote aria-hidden="true" className="size-5" />
            {t('checkout.cod')}
          </label>
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
        <div className="flex justify-between border-t border-border pt-3">
          <span className="font-semibold">{t('cart.total')}</span>
          <span data-testid="checkout-total">
            <Price value={cart.totalTiyin} locale={locale} className="text-lg font-bold" />
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
          {t('checkout.placeOrder')}
        </Button>
      </aside>
    </form>
  );
}
