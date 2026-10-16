import { Badge } from '@uzgo/ui/components/badge';
import { formatPrice } from '@uzgo/ui/lib/money';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { CourierActions, CourierCreateForm } from '@/components/admin/food-forms';
import type { Locale } from '@/i18n/routing';
import { getAdminCouriers } from '@/lib/food-api';
import { formatPhone } from '@/lib/format-phone';
import { requireStaff } from '../../staff';

/** UZGO couriers: add, suspend, settle cash and pay (ADR 0024). */
export default async function AdminCouriersPage() {
  await requireStaff('/admin/couriers', 'admin');
  const [t, locale, format, items] = await Promise.all([
    getTranslations('admin'),
    getLocale() as Promise<Locale>,
    getFormatter(),
    getAdminCouriers(),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <section
        className="rounded-xl border border-border bg-card p-5"
        aria-labelledby="new-courier"
      >
        <h2 id="new-courier" className="mb-4 font-semibold">
          {t('courierNew')}
        </h2>
        <CourierCreateForm />
        <p className="mt-3 text-xs text-muted-foreground">{t('courierBalanceHint')}</p>
      </section>
      {items.length === 0 ? (
        <p className="text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {items.map((c) => (
            <li
              key={c.userId}
              className="flex flex-col gap-2 p-4 text-sm"
              data-testid="admin-courier"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{c.name ?? formatPhone(c.phone)}</span>
                <span className="text-muted-foreground">{formatPhone(c.phone)}</span>
                <Badge variant={c.status === 'ACTIVE' ? 'secondary' : 'muted'}>
                  {t(`courierStatus_${c.status}`)}
                </Badge>
                <Badge variant={c.online ? 'accent' : 'muted'}>
                  {c.online ? t('courierOnline') : t('courierOffline')}
                </Badge>
                <span className="text-muted-foreground">{t(`vehicle_${c.vehicle}`)}</span>
              </div>
              <p className="text-muted-foreground">
                {[
                  t('courierBalance', {
                    amount: formatPrice(c.balanceTiyin.replace('-', ''), locale),
                    sign: c.balanceTiyin.startsWith('-') ? 'minus' : 'plus',
                  }),
                  t('courierStats', { active: c.activeOrders, delivered: c.delivered }),
                  c.lastSeenAt
                    ? t('courierSeen', {
                        time: format.dateTime(new Date(c.lastSeenAt), {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        }),
                      })
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <CourierActions userId={c.userId} status={c.status} balanceTiyin={c.balanceTiyin} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
