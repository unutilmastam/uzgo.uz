import { Badge } from '@uzgo/ui/components/badge';
import { getLocale, getTranslations } from 'next-intl/server';
import { RestaurantCreateForm } from '@/components/admin/food-forms';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { getRegions } from '@/lib/api-server';
import { getAdminRestaurants } from '@/lib/food-api';
import { requireStaff } from '../../staff';

/** UZGO Food restaurants: added by staff only (ADR 0024). */
export default async function AdminRestaurantsPage() {
  await requireStaff('/admin/restaurants', 'admin');
  const [t, locale, items, regions] = await Promise.all([
    getTranslations('admin'),
    getLocale() as Promise<Locale>,
    getAdminRestaurants(),
    getRegions(),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <section
        className="rounded-xl border border-border bg-card p-5"
        aria-labelledby="new-restaurant"
      >
        <h2 id="new-restaurant" className="mb-4 font-semibold">
          {t('foodNew')}
        </h2>
        <RestaurantCreateForm regions={regions} />
      </section>
      {items.length === 0 ? (
        <p className="text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {items.map((r) => (
            <li key={r.id}>
              <Link
                href={`/admin/restaurants/${r.id}`}
                className="flex flex-wrap items-center gap-3 p-4 hover:bg-muted/50"
                data-testid="admin-restaurant"
              >
                <span className="flex-1 font-medium">{r.name[locale]}</span>
                <span className="text-sm text-muted-foreground">{r.district?.[locale]}</span>
                <Badge variant="muted">{t(`foodMode_${r.deliveryMode}`)}</Badge>
                <Badge variant={r.status === 'ACTIVE' ? 'secondary' : 'muted'}>
                  {t(`foodStatus_${r.status}`)}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
