import type { FoodOrderInfo, SellerOrderStatus } from '@uzgo/contracts';
import { Bike, Clock, MapPin, Phone } from 'lucide-react';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { AutoRefresh } from './auto-refresh';

const ACTIVE = new Set<SellerOrderStatus>(['NEW', 'ACCEPTED', 'PACKED', 'HANDED_TO_DELIVERY']);

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;
function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return (2 * R * Math.asin(Math.sqrt(h))) / 1000;
}

/** OpenStreetMap link (no embedded tiles: ADR 0024). */
const mapLink = (p: { lat: number; lng: number }) =>
  `https://www.openstreetmap.org/?mlat=${p.lat.toFixed(5)}&mlon=${p.lng.toFixed(5)}#map=16/${p.lat.toFixed(5)}/${p.lng.toFixed(5)}`;

/** Food order: restaurant, expected time, courier and their last position (live). */
export async function FoodTracking({
  food,
  status,
}: {
  food: FoodOrderInfo;
  status: SellerOrderStatus;
}) {
  const [t, locale, format] = await Promise.all([
    getTranslations('food'),
    getLocale(),
    getFormatter(),
  ]);
  const l = locale as Locale;
  const active = ACTIVE.has(status);
  const courier = food.courier;
  return (
    <section
      className="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-sm"
      aria-labelledby="food-tracking"
      data-testid="food-tracking"
    >
      {active ? <AutoRefresh seconds={15} /> : null}
      <h2 id="food-tracking" className="text-base font-semibold">
        {t(`ss_${status}`)}
      </h2>
      {active && food.etaAt ? (
        <p className="flex items-center gap-2">
          <Clock aria-hidden="true" className="size-4 text-primary" />
          {t('etaAt', {
            time: format.dateTime(new Date(food.etaAt), {
              timeStyle: 'short',
              timeZone: 'Asia/Tashkent',
            }),
          })}
        </p>
      ) : null}
      <p className="flex flex-wrap items-center gap-2">
        <MapPin aria-hidden="true" className="size-4 text-muted-foreground" />
        {food.restaurant.name[l]}
        {food.restaurant.phone ? (
          <a
            href={`tel:${food.restaurant.phone}`}
            className="inline-flex items-center gap-1 underline"
          >
            <Phone aria-hidden="true" className="size-3.5" />
            {food.restaurant.phone}
          </a>
        ) : null}
      </p>
      {courier ? (
        <div className="flex flex-col gap-1 rounded-lg bg-muted/50 p-3" data-testid="food-courier">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            <Bike aria-hidden="true" className="size-4 text-primary" />
            {t('courierLine', { name: courier.name ?? t('courier') })}
            <a
              href={`tel:${courier.phone}`}
              className="inline-flex items-center gap-1 font-normal underline"
            >
              <Phone aria-hidden="true" className="size-3.5" />
              {courier.phone}
            </a>
          </p>
          {courier.position ? (
            <p className="text-muted-foreground">
              {t('courierDistance', {
                km: km(courier.position, food.destination).toFixed(1),
                time: format.dateTime(new Date(courier.position.at), {
                  timeStyle: 'short',
                  timeZone: 'Asia/Tashkent',
                }),
              })}{' '}
              <a
                href={mapLink(courier.position)}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {t('openMap')}
              </a>
            </p>
          ) : null}
        </div>
      ) : food.deliveryMode === 'UZGO' && active ? (
        <p className="text-muted-foreground">{t('waitingCourier')}</p>
      ) : null}
    </section>
  );
}
