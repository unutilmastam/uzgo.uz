import { Badge } from '@uzgo/ui/components/badge';
import { Price } from '@uzgo/ui/components/price';
import { ChevronRight } from 'lucide-react';
import type { Metadata } from 'next';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { RideRequest } from '@/components/go/ride-request';
import { PageShell } from '@/components/page-shell';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { getCurrentUser, getPaymentMethods, getRegions } from '@/lib/api-server';
import { getMyRides } from '@/lib/go-api';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('go');
  return { title: t('title'), description: t('description') };
}

const OPEN = new Set(['AWAITING_PAYMENT', 'SEARCHING', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS']);

/** UZGO Go: call a car at a fixed price (ADR 0025). */
export default async function GoPage() {
  const [t, locale, format, user, regions, methods] = await Promise.all([
    getTranslations('go'),
    getLocale() as Promise<Locale>,
    getFormatter(),
    getCurrentUser(),
    getRegions(),
    getPaymentMethods(),
  ]);
  const rides = user ? await getMyRides() : [];
  const open = rides.find((r) => OPEN.has(r.status));
  return (
    <PageShell title={t('title')}>
      <p className="-mt-3 mb-5 text-muted-foreground">{t('description')}</p>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div>
          {open ? (
            <Link
              href={`/go/${open.number}`}
              className="flex items-center gap-3 rounded-xl border-2 border-primary bg-card p-4"
              data-testid="open-ride"
            >
              <span className="flex flex-1 flex-col">
                <span className="font-semibold">{t('openRide')}</span>
                <span className="text-sm text-muted-foreground">{t(`status_${open.status}`)}</span>
              </span>
              <ChevronRight aria-hidden="true" className="size-5" />
            </Link>
          ) : (
            <RideRequest user={user} regions={regions} methods={methods.items} />
          )}
          <p className="mt-3 text-xs text-muted-foreground">{t('becomeDriverHint')}</p>
          <Link href="/driver" className="text-sm font-medium text-primary hover:underline">
            {t('becomeDriver')}
          </Link>
        </div>
        {rides.length > 0 ? (
          <section aria-labelledby="go-history" className="flex flex-col gap-2">
            <h2 id="go-history" className="font-semibold">
              {t('history')}
            </h2>
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {rides.slice(0, 10).map((r) => (
                <li key={r.number}>
                  <Link
                    href={`/go/${r.number}`}
                    className="flex flex-col gap-1 p-3 text-sm hover:bg-muted"
                    data-testid="ride-history-item"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <Badge variant={OPEN.has(r.status) ? 'accent' : 'muted'}>
                        {t(`status_${r.status}`)}
                      </Badge>
                      <Price value={r.priceTiyin} locale={locale} className="font-normal" />
                    </span>
                    <span className="line-clamp-1">
                      {t('route', { from: r.pickupLabel, to: r.dropoffLabel })}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format.dateTime(new Date(r.createdAt), {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </PageShell>
  );
}
