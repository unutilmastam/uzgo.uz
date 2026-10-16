import { RIDE_STATUSES, type RideStatus } from '@uzgo/contracts';
import { Badge } from '@uzgo/ui/components/badge';
import { Price } from '@uzgo/ui/components/price';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { RideCancel } from '@/components/admin/go-forms';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { formatPhone } from '@/lib/format-phone';
import { getAdminRides } from '@/lib/go-api';
import { requireStaff } from '../../staff';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const OPEN = new Set(['AWAITING_PAYMENT', 'SEARCHING', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS']);

/** UZGO Go rides: newest first, cancel an open one (ADR 0025). */
export default async function AdminRidesPage({ searchParams }: Props) {
  await requireStaff('/admin/rides', 'admin');
  const query = await searchParams;
  const raw = typeof query.status === 'string' ? query.status : '';
  const status = (RIDE_STATUSES as readonly string[]).includes(raw)
    ? (raw as RideStatus)
    : undefined;
  const [t, locale, format, items] = await Promise.all([
    getTranslations(),
    getLocale() as Promise<Locale>,
    getFormatter(),
    getAdminRides(status),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label={t('admin.rideFilter')} className="flex flex-wrap gap-2 text-sm">
        {['ALL', ...RIDE_STATUSES].map((s) => (
          <Link
            key={s}
            href={s === 'ALL' ? '/admin/rides' : { pathname: '/admin/rides', query: { status: s } }}
            aria-current={(status ?? 'ALL') === s ? 'page' : undefined}
            className="rounded-full border border-border px-3 py-1 aria-[current=page]:border-primary aria-[current=page]:bg-primary/10"
          >
            {s === 'ALL' ? t('admin.all') : t(`go.status_${s}`)}
          </Link>
        ))}
      </nav>
      {items.length === 0 ? (
        <p className="text-muted-foreground">{t('admin.empty')}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {items.map((r) => (
            <li key={r.number} className="flex flex-col gap-2 p-4 text-sm" data-testid="admin-ride">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.number}</span>
                <Badge variant={OPEN.has(r.status) ? 'accent' : 'muted'}>
                  {t(`go.status_${r.status}`)}
                </Badge>
                <span className="text-muted-foreground">{t(`go.class_${r.rideClass}`)}</span>
                <Price value={r.priceTiyin} locale={locale} className="font-normal" />
                <span className="text-muted-foreground">
                  {t(`checkout.method_${r.paymentMethod}`)}
                  {r.paid ? ` · ${t('go.paid')}` : ''}
                </span>
              </div>
              <p>{t('go.route', { from: r.pickupLabel, to: r.dropoffLabel })}</p>
              <p className="text-muted-foreground">
                {[
                  t('admin.rideRider', { phone: formatPhone(r.riderPhone) }),
                  r.driverPhone
                    ? t('admin.rideDriver', { phone: formatPhone(r.driverPhone) })
                    : null,
                  format.dateTime(new Date(r.createdAt), {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }),
                  r.cancelReason ? t('admin.rideReason', { reason: r.cancelReason }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {OPEN.has(r.status) ? <RideCancel number={r.number} /> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
