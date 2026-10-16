import { Badge } from '@uzgo/ui/components/badge';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { FoodImageUpload, MenuEditor, RestaurantSettings } from '@/components/admin/food-forms';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { getAdminRestaurant } from '@/lib/food-api';
import { requireStaff } from '../../../staff';

export default async function AdminRestaurantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  await requireStaff(`/admin/restaurants/${id}`, 'admin');
  const [t, locale, restaurant] = await Promise.all([
    getTranslations('admin'),
    getLocale() as Promise<Locale>,
    getAdminRestaurant(id),
  ]);
  if (!restaurant) notFound();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/restaurants"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t('tabRestaurants')}
        </Link>
        <h2 className="text-xl font-semibold">{restaurant.name[locale]}</h2>
        <Badge variant={restaurant.status === 'ACTIVE' ? 'secondary' : 'muted'}>
          {t(`foodStatus_${restaurant.status}`)}
        </Badge>
        <Link href={`/food/${restaurant.slug}`} className="text-sm underline">
          {t('foodOpenPublic')}
        </Link>
      </div>
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">{t('foodSettings')}</h3>
          <FoodImageUpload restaurantId={restaurant.id} label={t('foodCover')} />
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          {t('foodWhere', {
            address: restaurant.address,
            lat: restaurant.lat.toFixed(5),
            lng: restaurant.lng.toFixed(5),
          })}
        </p>
        <RestaurantSettings restaurant={restaurant} />
      </section>
      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-4 font-semibold">{t('foodMenu')}</h3>
        <MenuEditor restaurant={restaurant} />
      </section>
    </div>
  );
}
