import { EmptyState } from '@uzgo/ui/components/empty-state';
import { formatPrice } from '@uzgo/ui/lib/money';
import { Wallet } from 'lucide-react';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { AdminAction } from '@/components/admin/admin-action';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { getAdminPayouts, getAdminRefunds, getLedgerSummary } from '@/lib/admin-api';
import { requireStaff } from '../../staff';

const ACCOUNTS = [
  'PROVIDER_CLEARING',
  'CUSTOMER_PREPAYMENTS',
  'SELLER_PAYABLE',
  'PLATFORM_REVENUE',
  'PLATFORM_PROMOTIONS',
  'COURIER_PAYABLE',
] as const;

/** Money work for admins: refunds to perform, payouts to send, ledger balances. */
export default async function AdminFinancePage() {
  await requireStaff('/admin/finance', 'admin');
  const [t, locale, format, ledger, refunds, payouts] = await Promise.all([
    getTranslations('admin'),
    getLocale() as Promise<Locale>,
    getFormatter(),
    getLedgerSummary(),
    getAdminRefunds('PENDING', 1),
    getAdminPayouts('PENDING', 1),
  ]);
  const money = (v: string) => formatPrice(v, locale);
  const box = 'rounded-xl border border-border bg-card p-5';
  const date = (v: string) =>
    format.dateTime(new Date(v), { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="ledger" className={box}>
        <h2 id="ledger" className="mb-3 font-semibold">
          {t('ledgerTitle')}
        </h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {ACCOUNTS.map((account) => (
            <div key={account} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t(`acc_${account}`)}</dt>
              <dd className="font-medium tabular-nums">
                {money(ledger?.accounts[account] ?? '0')}
              </dd>
            </div>
          ))}
          <div className="flex justify-between gap-3 border-t border-border pt-2 sm:col-span-2">
            <dt>{t('ledgerTotal')}</dt>
            <dd className="font-semibold" data-testid="ledger-total">
              {money(ledger?.total ?? '0')}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="refunds" className="flex flex-col gap-3">
        <h2 id="refunds" className="text-lg font-semibold">
          {t('refunds')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('refundHint')}</p>
        {!refunds || refunds.items.length === 0 ? (
          <EmptyState icon={<Wallet />} title={t('empty')} />
        ) : (
          <ul className="flex flex-col gap-3">
            {refunds.items.map((refund) => (
              <li key={refund.id} className={box} data-testid="admin-refund">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    {refund.shipmentNumber ?? refund.orderNumber}
                  </span>
                  <span className="text-sm">{refund.method}</span>
                  <span className="font-semibold">{money(refund.amountTiyin)}</span>
                </div>
                <p className="mb-3 text-sm text-muted-foreground">
                  {[
                    t.has(`reason_${refund.reason}`) ? t(`reason_${refund.reason}`) : refund.reason,
                    date(refund.createdAt),
                  ].join(' · ')}
                </p>
                <div className="flex flex-wrap items-start gap-2">
                  <AdminAction
                    path={`/admin/refunds/${refund.id}/succeed`}
                    label={t('refundDone')}
                    withReason
                    field="reference"
                    fieldLabel={t('reference')}
                    variant="primary"
                  />
                  <AdminAction
                    path={`/admin/refunds/${refund.id}/fail`}
                    label={t('refundFailed')}
                    withReason
                    field="note"
                    fieldLabel={t('note')}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="payouts" className="flex flex-col gap-3">
        <h2 id="payouts" className="text-lg font-semibold">
          {t('payouts')}
        </h2>
        {!payouts || payouts.items.length === 0 ? (
          <EmptyState icon={<Wallet />} title={t('empty')} />
        ) : (
          <ul className="flex flex-col gap-3">
            {payouts.items.map((payout) => (
              <li key={payout.id} className={box} data-testid="admin-payout">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/admin/finance/stores/${payout.store.id}`}
                    className="font-semibold hover:underline"
                  >
                    {payout.store.name[locale]}
                  </Link>
                  <span className="font-semibold">{money(payout.amountTiyin)}</span>
                </div>
                <p className="mb-3 text-sm text-muted-foreground tabular-nums">
                  {[
                    payout.bankSnapshot.bankName,
                    payout.bankSnapshot.mfo,
                    payout.bankSnapshot.account,
                    payout.bankSnapshot.recipient,
                  ].join(' · ')}
                </p>
                <div className="flex flex-wrap items-start gap-2">
                  <AdminAction
                    path={`/admin/payouts/${payout.id}/paid`}
                    label={t('markPaid')}
                    withReason
                    field="reference"
                    fieldLabel={t('reference')}
                    variant="primary"
                  />
                  <AdminAction path={`/admin/payouts/${payout.id}/cancel`} label={t('cancel')} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
