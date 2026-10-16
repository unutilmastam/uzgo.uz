import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { AutoRefresh } from '@/components/food/auto-refresh';
import { RestaurantBoard } from '@/components/food/restaurant-board';
import type { Locale } from '@/i18n/routing';
import { getTeamOrders, getTeamRestaurant } from '@/lib/food-api';
import { requireUser } from '@/lib/require-user';

type Props = {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ scope?: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('food');
  return { title: t('panelTitle'), robots: { index: false } };
}

/** Restaurant team panel (members of a RESTAURANT store; others get 404). */
export default async function RestaurantPanelPage({ params, searchParams }: Props) {
  const [{ storeId }, query, locale] = await Promise.all([params, searchParams, getLocale()]);
  if (!z.uuid().safeParse(storeId).success) notFound();
  await requireUser(`/restaurant/${storeId}`);
  const scope = query.scope === 'all' ? 'all' : 'active';
  const [t, restaurant, orders] = await Promise.all([
    getTranslations('food'),
    getTeamRestaurant(storeId),
    getTeamOrders(storeId, scope),
  ]);
  if (!restaurant) notFound();
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:py-10">
      <AutoRefresh seconds={20} />
      <h1 className="mb-1 text-2xl font-bold md:text-3xl">{restaurant.name[locale as Locale]}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{t('panelTitle')}</p>
      <RestaurantBoard restaurant={restaurant} orders={orders} scope={scope} />
    </div>
  );
}
