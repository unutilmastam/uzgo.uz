import { formatPrice } from '@uzgo/ui/lib/money';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { CommissionForm, CreatePayoutForm } from '@/components/admin/store-money-forms';
import type { Locale } from '@/i18n/routing';
import { getAdminStoreFinance } from '@/lib/admin-api';
import { requireStaff } from '../../../../staff';

export default async function AdminStoreFinancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  await requireStaff(`/admin/finance/stores/${id}`, 'admin');
  const [t, ts, locale, finance] = await Promise.all([
    getTranslations('admin'),
    getTranslations('seller'),
    getLocale() as Promise<Locale>,
    getAdminStoreFinance(id),
  ]);
  if (!finance) notFound();
  const money = (v: string) => formatPrice(v, locale);
  const box = 'rounded-xl border border-border bg-card p-5';

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <h2 className="text-xl font-semibold">{t('storeFinance')}</h2>
      <dl className={`${box} grid gap-2 text-sm sm:grid-cols-2`}>
        <div className="flex justify-between gap-3">
          <dt>{ts('balance')}</dt>
          <dd className="font-semibold">{money(finance.balanceTiyin)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>{ts('available')}</dt>
          <dd className="font-semibold text-accent" data-testid="admin-available">
            {money(finance.availableTiyin)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>{ts('held', { days: finance.holdDays })}</dt>
          <dd>{money(finance.heldTiyin)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>{ts('pendingPayouts')}</dt>
          <dd>{money(finance.pendingPayoutsTiyin)}</dd>
        </div>
      </dl>
      <section className={box} aria-labelledby="payout">
        <h3 id="payout" className="mb-3 font-semibold">
          {t('createPayout')}
        </h3>
        <p className="mb-3 text-sm text-muted-foreground tabular-nums">
          {finance.payoutDetails
            ? [
                finance.payoutDetails.bankName,
                finance.payoutDetails.mfo,
                finance.payoutDetails.account,
              ].join(' · ')
            : t('error_PAYOUT_DETAILS_MISSING')}
        </p>
        <CreatePayoutForm storeId={id} />
      </section>
      <section className={box} aria-labelledby="commission">
        <h3 id="commission" className="mb-3 font-semibold">
          {t('commission')}
        </h3>
        <CommissionForm storeId={id} />
      </section>
    </div>
  );
}
