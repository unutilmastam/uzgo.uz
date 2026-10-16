import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { RestaurantList } from '@/components/food/restaurant-list';
import { PageShell } from '@/components/page-shell';
import { getRestaurants } from '@/lib/food-api';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('food');
  return { title: t('title'), description: t('description') };
}

/** UZGO Food: restaurants (ADR 0024). */
export default async function FoodPage() {
  const [t, items] = await Promise.all([getTranslations('food'), getRestaurants()]);
  return (
    <PageShell title={t('title')}>
      <p className="-mt-3 mb-5 text-muted-foreground">{t('description')}</p>
      <RestaurantList initial={items} />
    </PageShell>
  );
}
