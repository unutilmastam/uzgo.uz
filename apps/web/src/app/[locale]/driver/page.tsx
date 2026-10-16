import { Badge } from '@uzgo/ui/components/badge';
import { Smartphone } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DriverApplicationForm } from '@/components/go/driver-application-form';
import { PageShell } from '@/components/page-shell';
import { getDriverApplication } from '@/lib/go-api';
import { requireUser } from '@/lib/require-user';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('driver');
  return { title: t('title'), robots: { index: false } };
}

/** Become a UZGO Go driver: apply, see the review result; driving is in the app (ADR 0025). */
export default async function DriverPage() {
  await requireUser('/driver');
  const [t, application] = await Promise.all([getTranslations(), getDriverApplication()]);
  const status = application?.status ?? null;
  return (
    <PageShell title={t('driver.title')}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        {status ? (
          <section
            aria-labelledby="driver-status"
            className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5"
            data-testid="driver-status"
          >
            <h2 id="driver-status" className="flex flex-wrap items-center gap-2 font-semibold">
              {t('driver.statusTitle')}
              <Badge variant={status === 'ACTIVE' ? 'accent' : 'muted'}>
                {t(`driver.status_${status}`)}
              </Badge>
            </h2>
            <p className="text-sm text-muted-foreground">{t(`driver.statusText_${status}`)}</p>
            {application?.reviewNote ? (
              <p className="rounded-md bg-muted p-3 text-sm" data-testid="driver-review-note">
                {t('driver.note', { note: application.reviewNote })}
              </p>
            ) : null}
            {status === 'ACTIVE' ? (
              <p className="flex items-center gap-2 text-sm font-medium">
                <Smartphone aria-hidden="true" className="size-4" />
                {t('driver.useApp')}
              </p>
            ) : null}
          </section>
        ) : (
          <p className="text-muted-foreground">{t('driver.intro')}</p>
        )}
        {status === null || status === 'PENDING' || status === 'REJECTED' ? (
          <section className="rounded-xl border border-border bg-card p-5">
            <DriverApplicationForm current={application} />
          </section>
        ) : null}
      </div>
    </PageShell>
  );
}
