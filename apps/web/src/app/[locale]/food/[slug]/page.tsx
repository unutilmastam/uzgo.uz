import { Badge } from '@uzgo/ui/components/badge';
import { Clock, MapPin, Phone } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { RestaurantOrdering } from '@/components/food/restaurant-ordering';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { getCurrentUser, getPaymentMethods } from '@/lib/api-server';
import { getRestaurant } from '@/lib/food-api';

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) notFound();
  const restaurant = await getRestaurant(slug);
  if (!restaurant) notFound();
  return restaurant;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ slug }, locale] = await Promise.all([params, getLocale()]);
  const r = await load(slug);
  const l = locale as Locale;
  return {
    title: r.name[l],
    description: r.description?.[l] ?? undefined,
    alternates: {
      canonical: `/${locale}/food/${slug}`,
      languages: { uz: `/uz/food/${slug}`, ru: `/ru/food/${slug}` },
    },
  };
}

/** A restaurant: menu, basket and ordering (ADR 0024). */
export default async function RestaurantPage({ params }: Props) {
  const [{ slug }, t, locale] = await Promise.all([params, getTranslations(), getLocale()]);
  const l = locale as Locale;
  const [restaurant, user, methods] = await Promise.all([
    load(slug),
    getCurrentUser(),
    getPaymentMethods(),
  ]);
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <nav aria-label={t('food.title')} className="mb-3 text-sm">
        <Link href="/food" className="text-muted-foreground hover:text-foreground">
          {t('food.title')}
        </Link>
      </nav>
      <header className="mb-6 flex flex-col gap-2">
        <h1 className="text-2xl font-bold md:text-3xl">{restaurant.name[l]}</h1>
        {restaurant.description ? (
          <p className="text-muted-foreground">{restaurant.description[l]}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <Badge variant={restaurant.openNow ? 'secondary' : 'muted'}>
            {restaurant.openNow ? t('food.openNow') : t('food.closedNow')}
          </Badge>
          <span className="inline-flex items-center gap-1">
            <MapPin aria-hidden="true" className="size-4" />
            {restaurant.address}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock aria-hidden="true" className="size-4" />
            {t('food.prep', { minutes: restaurant.prepMinutes })}
          </span>
          {restaurant.phone ? (
            <a
              href={`tel:${restaurant.phone}`}
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <Phone aria-hidden="true" className="size-4" />
              {restaurant.phone}
            </a>
          ) : null}
          <span>{t(`food.mode_${restaurant.deliveryMode}`)}</span>
        </div>
      </header>
      {restaurant.menu.length === 0 ? (
        <p className="text-muted-foreground">{t('food.menuEmpty')}</p>
      ) : (
        <RestaurantOrdering restaurant={restaurant} user={user} methods={methods.items} />
      )}
    </div>
  );
}
