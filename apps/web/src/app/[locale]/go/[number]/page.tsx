import { Badge } from '@uzgo/ui/components/badge';
import { Price } from '@uzgo/ui/components/price';
import { formatPrice } from '@uzgo/ui/lib/money';
import { Car, Flag, MapPin, Phone } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { Breadcrumbs } from '@/components/catalog/breadcrumbs';
import { AutoRefresh } from '@/components/food/auto-refresh';
import { RideActions } from '@/components/go/ride-actions';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { getCurrentUser } from '@/lib/api-server';
import { formatPhone } from '@/lib/format-phone';
import { getMyRide } from '@/lib/go-api';

type Props = { params: Promise<{ number: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ number }, t] = await Promise.all([params, getTranslations('go')]);
  return { title: t('rideTitle', { number }), robots: { index: false } };
}

const LIVE = new Set(['AWAITING_PAYMENT', 'SEARCHING', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS']);

/** One ride, live: status, the driver and the car, pay or cancel (ADR 0025). */
export default async function RidePage({ params }: Props) {
  const [{ number }, t, locale, format] = await Promise.all([
    params,
    getTranslations(),
    getLocale(),
    getFormatter(),
  ]);
  const l = locale as Locale;
  if (!(await getCurrentUser())) {
    redirect({ href: { pathname: '/login', query: { next: `/go/${number}` } }, locale });
  }
  const ride = /^UZ-\d{4}-\d{6,}$/.test(number) ? await getMyRide(number) : null;
  if (!ride) notFound();
  const live = LIVE.has(ride.status);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {live ? <AutoRefresh seconds={5} /> : null}
      <Breadcrumbs items={[{ href: '/go', label: t('go.title') }, { label: ride.number }]} />
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold" data-testid="ride-status" aria-live="polite">
            {t(`go.status_${ride.status}`)}
          </h1>
          <Badge variant="muted">{t(`go.class_${ride.rideClass}`)}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{t(`go.statusHint_${ride.status}`)}</p>

        <ol className="flex flex-col gap-2 text-sm">
          <li className="flex items-start gap-2">
            <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              <span className="sr-only">{t('go.from')}: </span>
              {ride.pickup.label}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Flag aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
            <span>
              <span className="sr-only">{t('go.to')}: </span>
              {ride.dropoff.label}
            </span>
          </li>
        </ol>

        {ride.driver ? (
          <section
            aria-labelledby="ride-driver"
            className="flex flex-col gap-2 rounded-lg bg-muted p-3"
            data-testid="ride-driver"
          >
            <h2 id="ride-driver" className="flex items-center gap-2 font-semibold">
              <Car aria-hidden="true" className="size-5" />
              {t('go.driverIs', { name: ride.driver.name })}
            </h2>
            <p className="text-sm">
              {t('go.carLine', {
                color: ride.driver.car.color,
                make: ride.driver.car.make,
                model: ride.driver.car.model,
              })}
            </p>
            <p className="font-mono text-lg font-bold tracking-wider" data-testid="ride-plate">
              {ride.driver.car.plate}
            </p>
            {ride.driver.phone ? (
              <a
                href={`tel:${ride.driver.phone}`}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary"
              >
                <Phone aria-hidden="true" className="size-4" />
                {formatPhone(ride.driver.phone)}
              </a>
            ) : null}
            {ride.driver.position ? (
              <a
                className="text-sm text-primary hover:underline"
                target="_blank"
                rel="noreferrer"
                href={`https://www.openstreetmap.org/?mlat=${String(ride.driver.position.lat)}&mlon=${String(ride.driver.position.lng)}#map=16/${String(ride.driver.position.lat)}/${String(ride.driver.position.lng)}`}
              >
                {t('go.driverOnMap', {
                  time: format.dateTime(new Date(ride.driver.position.at), { timeStyle: 'short' }),
                })}
              </a>
            ) : null}
          </section>
        ) : null}

        <dl className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
          <div className="flex justify-between">
            <dt>{t('go.price')}</dt>
            <dd data-testid="ride-price">
              <Price value={ride.priceTiyin} locale={l} />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt>{t('checkout.paymentTitle')}</dt>
            <dd>
              {t(`checkout.method_${ride.paymentMethod}`)}
              {ride.paid ? ` · ${t('go.paid')}` : ''}
            </dd>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <dt>{t('go.trip')}</dt>
            <dd>
              {t('go.tripInfo', {
                km: (ride.distanceM / 1000).toFixed(1),
                minutes: ride.etaMinutes,
              })}
            </dd>
          </div>
        </dl>
        {ride.refund ? (
          <p role="status" className="rounded-md bg-success/10 p-3 text-sm">
            {t(ride.refund.status === 'SUCCEEDED' ? 'go.refunded' : 'go.refundPending', {
              amount: formatPrice(ride.refund.amountTiyin, l),
            })}
          </p>
        ) : null}
        {ride.awaitingPayment && ride.paymentDueAt ? (
          <p className="text-sm text-muted-foreground">
            {t('go.payBy', {
              time: format.dateTime(new Date(ride.paymentDueAt), { timeStyle: 'short' }),
            })}
          </p>
        ) : null}
        <RideActions
          number={ride.number}
          canPay={ride.awaitingPayment}
          canCancel={ride.canCancel}
        />
      </div>
    </div>
  );
}
