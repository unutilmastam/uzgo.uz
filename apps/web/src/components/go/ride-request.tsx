'use client';

import {
  type CurrentUser,
  type PaymentMethod,
  type Region,
  type RideClass,
  type RideQuote,
  rideQuoteSchema,
  rideViewSchema,
} from '@uzgo/contracts';
import { Button } from '@uzgo/ui/components/button';
import { Price } from '@uzgo/ui/components/price';
import { Car, CarTaxiFront } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { PointPicker } from '@/components/food/point-picker';
import { usePoint } from '@/components/food/use-point';
import { DistrictPicker } from '@/components/geo/district-picker';
import { FormError, Textarea } from '@/components/panel/form-controls';
import { Link, useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { ApiClientError, apiClient } from '@/lib/api-client';
import { z } from 'zod';

export const PICKUP_KEY = 'uzgo:go:pickup';
export const DROPOFF_KEY = 'uzgo:go:dropoff';

/**
 * Where from, where to, which car, how to pay. The fixed price always comes
 * from the server (quote) and the request sends the price the rider saw
 * (ADR 0025).
 */
export function RideRequest({
  user,
  regions,
  methods,
}: {
  user: CurrentUser | null;
  regions: Region[];
  methods: PaymentMethod[];
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const ids = { comment: useId(), error: useId() };
  const [pickup] = usePoint(PICKUP_KEY);
  const [dropoff] = usePoint(DROPOFF_KEY);
  const [quote, setQuote] = useState<RideQuote | null>(null);
  const [rideClass, setRideClass] = useState<RideClass>('ECONOMY');
  const [area, setArea] = useState({
    regionId: user?.profile.regionId ?? '',
    districtId: user?.profile.districtId ?? '',
  });
  const [comment, setComment] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH_ON_DELIVERY');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ body: string; key: string } | null>(null);

  const pointsKey = pickup && dropoff ? JSON.stringify([pickup, dropoff]) : '';
  useEffect(() => {
    if (!pointsKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no quote without both points
      setQuote(null);
      return;
    }
    const [from, to] = JSON.parse(pointsKey) as [
      { lat: number; lng: number },
      { lat: number; lng: number },
    ];
    let active = true;
    const timer = setTimeout(() => {
      apiClient('/rides/quote', {
        method: 'POST',
        body: { pickup: { lat: from.lat, lng: from.lng }, dropoff: { lat: to.lat, lng: to.lng } },
      }).then(
        (body) => {
          if (active) setQuote(rideQuoteSchema.parse(body));
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
  }, [pointsKey]);

  const price = quote?.options.find((o) => o.rideClass === rideClass)?.priceTiyin ?? null;
  const tooShort = quote !== null && quote.distanceM < 200;
  const ready =
    Boolean(user && pickup && dropoff && price && area.districtId) &&
    quote?.tooFar === false &&
    !tooShort;

  async function requestRide() {
    if (!ready || !pickup || !dropoff || !price) return;
    const body = {
      rideClass,
      pickup,
      dropoff,
      districtId: area.districtId,
      paymentMethod: method,
      expectedPriceTiyin: price,
      ...(comment.trim() ? { comment: comment.trim() } : {}),
    };
    // Same body → same Idempotency-Key: a retry can never order a second car.
    const serialized = JSON.stringify(body);
    if (attempt.current?.body !== serialized) {
      attempt.current = { body: serialized, key: crypto.randomUUID() };
    }
    setPending(true);
    setError(null);
    try {
      const { ride } = z.object({ ride: rideViewSchema }).parse(
        await apiClient('/rides', {
          method: 'POST',
          headers: { 'Idempotency-Key': attempt.current.key },
          body,
        }),
      );
      if (!ride.awaitingPayment) {
        router.push(`/go/${ride.number}`);
        return;
      }
      try {
        const { url } = await apiClient<{ url: string }>(
          `/orders/${ride.number}/payment-link?locale=${locale}`,
        );
        window.location.assign(url);
      } catch {
        router.push(`/go/${ride.number}`);
      }
    } catch (err) {
      const code = err instanceof ApiClientError ? err.code : '';
      if (code === 'PRICE_CHANGED') setQuote(null);
      setError(t.has(`go.error_${code}`) ? t(`go.error_${code}`) : t('auth.error_generic'));
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 md:p-5">
      <section aria-labelledby="go-from" className="flex flex-col gap-2">
        <h2 id="go-from" className="text-sm font-semibold">
          {t('go.from')}
        </h2>
        <PointPicker
          compact
          storageKey={PICKUP_KEY}
          hint={t('go.fromHint')}
          testId="pickup-picker"
        />
      </section>
      <section aria-labelledby="go-to" className="flex flex-col gap-2 border-t border-border pt-4">
        <h2 id="go-to" className="text-sm font-semibold">
          {t('go.to')}
        </h2>
        <PointPicker
          compact
          storageKey={DROPOFF_KEY}
          hint={t('go.toHint')}
          locateLabel={t('go.toHere')}
          testId="dropoff-picker"
        />
      </section>

      {quote ? (
        <section
          aria-labelledby="go-class"
          className="flex flex-col gap-2 border-t border-border pt-4"
        >
          <h2 id="go-class" className="text-sm font-semibold">
            {t('go.chooseClass')}
          </h2>
          <p className="text-xs text-muted-foreground" data-testid="ride-distance">
            {t('go.tripInfo', {
              km: (quote.distanceM / 1000).toFixed(1),
              minutes: quote.etaMinutes,
            })}
          </p>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-labelledby="go-class">
            {quote.options.map((o) => {
              const selected = o.rideClass === rideClass;
              const nearby = quote.driversNearby[o.rideClass];
              return (
                <label
                  key={o.rideClass}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${
                    selected ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                  data-testid="ride-class"
                >
                  <input
                    type="radio"
                    name="ride-class"
                    className="sr-only"
                    value={o.rideClass}
                    checked={selected}
                    onChange={() => {
                      setRideClass(o.rideClass);
                    }}
                  />
                  {o.rideClass === 'COMFORT' ? (
                    <Car aria-hidden="true" className="size-6 text-primary" />
                  ) : (
                    <CarTaxiFront aria-hidden="true" className="size-6 text-primary" />
                  )}
                  <span className="flex flex-1 flex-col">
                    <span className="font-medium">{t(`go.class_${o.rideClass}`)}</span>
                    <span className="text-xs text-muted-foreground">
                      {nearby > 0 ? t('go.driversNearby', { count: nearby }) : t('go.noDriversNow')}
                    </span>
                  </span>
                  <Price value={o.priceTiyin} locale={locale} />
                </label>
              );
            })}
          </div>
          {quote.tooFar ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {t('go.error_RIDE_TOO_LONG')}
            </p>
          ) : tooShort ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {t('go.error_RIDE_TOO_SHORT')}
            </p>
          ) : null}
        </section>
      ) : pickup && dropoff ? null : (
        <p className="text-sm text-muted-foreground">{t('go.pointsForPrice')}</p>
      )}

      {quote && !user ? (
        <Button asChild>
          <Link href={{ pathname: '/login', query: { next: '/go' } }}>{t('go.loginToRide')}</Link>
        </Button>
      ) : null}

      {quote && user ? (
        <form
          className="flex flex-col gap-3 border-t border-border pt-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void requestRide();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <DistrictPicker
              regions={regions}
              regionId={area.regionId}
              districtId={area.districtId}
              onChange={setArea}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.comment} className="text-sm font-medium">
              {t('go.comment')}
            </label>
            <Textarea
              id={ids.comment}
              value={comment}
              maxLength={300}
              className="min-h-16"
              placeholder={t('go.commentPlaceholder')}
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
                  name="ride-payment"
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
            {price ? (
              <span className="flex items-center gap-2">
                {t('go.call')}
                <span aria-hidden="true">·</span>
                <Price value={price} locale={locale} className="text-inherit" />
              </span>
            ) : (
              t('go.call')
            )}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
