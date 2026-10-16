import { DRIVER_STATUSES, type DriverStatus } from '@uzgo/contracts';
import { Badge } from '@uzgo/ui/components/badge';
import { formatPrice } from '@uzgo/ui/lib/money';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { DriverActions, DriverReview } from '@/components/admin/go-forms';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { formatPhone } from '@/lib/format-phone';
import { getAdminDrivers } from '@/lib/go-api';
import { requireStaff } from '../../staff';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** UZGO Go drivers: review applications, suspend, settle (ADR 0025). */
export default async function AdminDriversPage({ searchParams }: Props) {
  await requireStaff('/admin/drivers', 'admin');
  const query = await searchParams;
  const raw = typeof query.status === 'string' ? query.status : 'PENDING';
  const status = (DRIVER_STATUSES as readonly string[]).includes(raw)
    ? (raw as DriverStatus)
    : undefined;
  const [t, locale, format, items] = await Promise.all([
    getTranslations(),
    getLocale() as Promise<Locale>,
    getFormatter(),
    getAdminDrivers(status),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label={t('admin.driverFilter')} className="flex flex-wrap gap-2 text-sm">
        {[...DRIVER_STATUSES, 'ALL'].map((s) => (
          <Link
            key={s}
            href={{ pathname: '/admin/drivers', query: { status: s } }}
            aria-current={(status ?? 'ALL') === s ? 'page' : undefined}
            className="rounded-full border border-border px-3 py-1 aria-[current=page]:border-primary aria-[current=page]:bg-primary/10"
          >
            {s === 'ALL' ? t('admin.all') : t(`driver.status_${s}`)}
          </Link>
        ))}
      </nav>
      <p className="text-xs text-muted-foreground">{t('admin.driverCheckHint')}</p>
      {items.length === 0 ? (
        <p className="text-muted-foreground">{t('admin.empty')}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {items.map((d) => (
            <li
              key={d.userId}
              className="flex flex-col gap-2 p-4 text-sm"
              data-testid="admin-driver"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {t('admin.driverName', { first: d.firstName, last: d.lastName })}
                </span>
                <span className="text-muted-foreground">{formatPhone(d.phone)}</span>
                <Badge variant={d.status === 'ACTIVE' ? 'secondary' : 'muted'}>
                  {t(`driver.status_${d.status}`)}
                </Badge>
                {d.status === 'ACTIVE' ? (
                  <Badge variant={d.online ? 'accent' : 'muted'}>
                    {d.online ? t('admin.courierOnline') : t('admin.courierOffline')}
                  </Badge>
                ) : null}
                <span className="text-muted-foreground">{t(`go.class_${d.rideClass}`)}</span>
              </div>
              <p>
                {t('admin.driverCar', {
                  color: d.car.color,
                  make: d.car.make,
                  model: d.car.model,
                  year: d.car.year,
                  plate: d.car.plate,
                })}
              </p>
              <p className="text-muted-foreground">
                {[
                  t('admin.driverLicence', { number: d.licenceNumber }),
                  d.permitNumber ? t('admin.driverPermit', { number: d.permitNumber }) : null,
                  d.taxId ? t('admin.driverTaxId', { number: d.taxId }) : null,
                  t('admin.driverApplied', {
                    date: format.dateTime(new Date(d.createdAt), { dateStyle: 'medium' }),
                  }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {d.reviewNote ? (
                <p className="text-muted-foreground">{t('driver.note', { note: d.reviewNote })}</p>
              ) : null}
              {d.status === 'PENDING' ? (
                <DriverReview userId={d.userId} rideClass={d.rideClass} />
              ) : null}
              {d.status === 'ACTIVE' || d.status === 'SUSPENDED' ? (
                <>
                  <p className="text-muted-foreground">
                    {[
                      t('admin.driverBalance', {
                        amount: formatPrice(d.balanceTiyin.replace('-', ''), locale),
                        sign: d.balanceTiyin.startsWith('-') ? 'minus' : 'plus',
                      }),
                      t('admin.driverRides', { count: d.completedRides }),
                    ].join(' · ')}
                  </p>
                  <DriverActions
                    userId={d.userId}
                    status={d.status}
                    balanceTiyin={d.balanceTiyin}
                  />
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
