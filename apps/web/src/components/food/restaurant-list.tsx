'use client';

import { type RestaurantSummary, restaurantListSchema } from '@uzgo/contracts';
import { Badge } from '@uzgo/ui/components/badge';
import { formatPrice } from '@uzgo/ui/lib/money';
import { Bike, Clock, Store, UtensilsCrossed } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { apiClient } from '@/lib/api-client';
import { PointPicker } from './point-picker';
import { usePoint } from './use-point';

/** Restaurants; with a delivery point: nearest first with fee and time (server-computed). */
export function RestaurantList({ initial }: { initial: RestaurantSummary[] }) {
  const t = useTranslations('food');
  const locale = useLocale() as Locale;
  const [point] = usePoint();
  const [items, setItems] = useState(initial);

  useEffect(() => {
    if (!point) return;
    let active = true;
    apiClient(`/food/restaurants?lat=${String(point.lat)}&lng=${String(point.lng)}`).then(
      (body) => {
        if (active) setItems(restaurantListSchema.parse(body).items);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [point]);

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-2 font-semibold">{t('deliverTo')}</h2>
        <PointPicker compact />
      </section>
      {items.length === 0 ? (
        <p className="text-muted-foreground">{t('noRestaurants')}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((r) => (
            <li key={r.id}>
              <Link
                href={`/food/${r.slug}`}
                className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
                data-testid="restaurant-card"
              >
                <div className="relative aspect-[16/9] bg-[#ffe9e0] dark:bg-[#3a1d12]">
                  {r.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element -- object storage URLs
                    <img src={r.cover} alt="" className="size-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-[#c2410c]">
                      <UtensilsCrossed aria-hidden="true" className="size-12" />
                    </div>
                  )}
                  {!r.openNow ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-semibold text-white">
                      {t('closedNow')}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-3">
                  <h3 className="font-semibold group-hover:text-primary">{r.name[locale]}</h3>
                  {r.district ? (
                    <p className="text-xs text-muted-foreground">{r.district[locale]}</p>
                  ) : null}
                  <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {r.etaMinutes !== null ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock aria-hidden="true" className="size-3.5" />
                        {t('etaMinutes', { minutes: r.etaMinutes })}
                      </span>
                    ) : null}
                    {r.deliveryFeeTiyin !== null ? (
                      <span className="inline-flex items-center gap-1">
                        <Bike aria-hidden="true" className="size-3.5" />
                        {r.deliveryFeeTiyin === '0'
                          ? t('freeDelivery')
                          : formatPrice(r.deliveryFeeTiyin, locale)}
                      </span>
                    ) : null}
                    {r.minOrderTiyin !== '0' ? (
                      <span>{t('minOrder', { amount: formatPrice(r.minOrderTiyin, locale) })}</span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="muted">
                      <Store aria-hidden="true" className="mr-1 size-3" />
                      {t(`mode_${r.deliveryMode}`)}
                    </Badge>
                    {r.deliversHere === false ? (
                      <Badge variant="muted">{t('notDeliveringHere')}</Badge>
                    ) : null}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
