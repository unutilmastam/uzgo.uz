import { storeFinanceSchema } from '@uzgo/contracts';
import { Badge } from '@uzgo/ui/components/badge';
import { formatPrice } from '@uzgo/ui/lib/money';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { PayoutDetailsForm, TelegramForm } from '@/components/seller/finance-forms';
import type { Locale } from '@/i18n/routing';
import { apiFetch } from '@/lib/api-server';
import { loadSellerStore } from '../store-context';

const SEP = ' · ';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('seller');
  return { title: t('tabFinance'), robots: { index: false } };
}

/** Owner only: balance, bank details, ledger lines, payouts. */
export default async function SellerFinancePage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const { store } = await loadSellerStore(storeId, `/seller/${storeId}/finance`);
  if (store.myRole !== 'OWNER') notFound();
  const res = await apiFetch(`/seller/stores/${store.id}/finance`);
  if (!res.ok) notFound();
  const finance = storeFinanceSchema.parse(await res.json());
  const [t, locale, format] = await Promise.all([
    getTranslations('seller'),
    getLocale() as Promise<Locale>,
    getFormatter(),
  ]);
  const money = (value: string) => formatPrice(value, locale);
  const cards = [
    { label: t('balance'), value: finance.balanceTiyin },
    { label: t('held', { days: finance.holdDays }), value: finance.heldTiyin },
    { label: t('pendingPayouts'), value: finance.pendingPayoutsTiyin },
    { label: t('available'), value: finance.availableTiyin, strong: true },
  ];
  const section = 'rounded-xl border border-border bg-card p-5';

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <dl className="grid gap-3 sm:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className={section}>
            <dt className="text-sm text-muted-foreground">{card.label}</dt>
            <dd
              className={card.strong ? 'text-xl font-bold text-accent' : 'text-xl font-semibold'}
              data-testid={card.strong ? 'finance-available' : undefined}
            >
              {money(card.value)}
            </dd>
          </div>
        ))}
      </dl>
      <section aria-labelledby="bank" className={section}>
        <h2 id="bank" className="mb-3 font-semibold">
          {t('payoutDetails')}
        </h2>
        <PayoutDetailsForm storeId={store.id} initial={finance.payoutDetails} />
      </section>
      <section aria-labelledby="notify" className={section}>
        <h2 id="notify" className="mb-3 font-semibold">
          {t('notifications')}
        </h2>
        <TelegramForm storeId={store.id} />
      </section>
      <section aria-labelledby="ledger" className={section}>
        <h2 id="ledger" className="mb-3 font-semibold">
          {t('ledger')}
        </h2>
        {finance.lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noLedger')}</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {finance.lines.map((line) => (
              <li key={line.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  {[
                    t.has(`kind_${line.kind}`) ? t(`kind_${line.kind}`) : line.kind,
                    line.shipmentNumber,
                  ]
                    .filter(Boolean)
                    .join(SEP)}
                </span>
                <span className="flex gap-3">
                  <span className="text-muted-foreground">
                    {format.dateTime(new Date(line.createdAt), { dateStyle: 'short' })}
                  </span>
                  <span
                    className={
                      line.amountTiyin.startsWith('-') ? 'text-destructive' : 'text-accent'
                    }
                  >
                    {money(line.amountTiyin)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="payouts" className={section}>
        <h2 id="payouts" className="mb-3 font-semibold">
          {t('payouts')}
        </h2>
        <ul className="divide-y divide-border text-sm">
          {finance.payouts.map((payout) => (
            <li key={payout.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{format.dateTime(new Date(payout.createdAt), { dateStyle: 'medium' })}</span>
              <Badge variant={payout.status === 'PAID' ? 'accent' : 'secondary'}>
                {t(`payoutStatus_${payout.status}`)}
              </Badge>
              <span className="font-semibold">{money(payout.amountTiyin)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
