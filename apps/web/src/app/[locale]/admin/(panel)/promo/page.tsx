import { Badge } from '@uzgo/ui/components/badge';
import { EmptyState } from '@uzgo/ui/components/empty-state';
import { formatPrice } from '@uzgo/ui/lib/money';
import { TicketPercent } from 'lucide-react';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { PromoCreateForm, PromoToggle } from '@/components/admin/promo-forms';
import type { Locale } from '@/i18n/routing';
import { getAdminPromos } from '@/lib/admin-api';
import { requireStaff } from '../../staff';

/** UZGO-funded promo codes: create, switch off, see uses and cost (ADR 0023). */
export default async function AdminPromoPage() {
  await requireStaff('/admin/promo', 'admin');
  const [t, locale, format, promos] = await Promise.all([
    getTranslations('admin'),
    getLocale() as Promise<Locale>,
    getFormatter(),
    getAdminPromos(),
  ]);
  const money = (v: string) => formatPrice(v, locale);
  const date = (v: string) =>
    format.dateTime(new Date(v), { dateStyle: 'medium', timeZone: 'Asia/Tashkent' });

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="promo-new" className="rounded-xl border border-border bg-card p-5">
        <h2 id="promo-new" className="mb-1 font-semibold">
          {t('promoNew')}
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">{t('promoFundedNote')}</p>
        <PromoCreateForm />
      </section>
      {promos.length === 0 ? (
        <EmptyState icon={<TicketPercent />} title={t('empty')} />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {promos.map((p) => (
            <li key={p.id} className="flex flex-wrap items-start gap-3 p-4" data-testid="promo-row">
              <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold">{p.code}</span>
                  <Badge variant={p.active ? 'secondary' : 'muted'}>
                    {p.active ? t('promoActive') : t('promoInactive')}
                  </Badge>
                </div>
                <span>
                  {p.kind === 'PERCENT'
                    ? t('promoTermsPercent', {
                        percent: (p.percentBp ?? 0) / 100,
                        max: p.maxDiscountTiyin ? money(p.maxDiscountTiyin) : '—',
                      })
                    : t('promoTermsFixed', { amount: money(p.amountTiyin ?? '0') })}
                  {p.minOrderTiyin !== '0'
                    ? ` · ${t('promoTermsMin', { amount: money(p.minOrderTiyin) })}`
                    : ''}
                </span>
                <span className="text-muted-foreground">
                  {[
                    p.startsAt ? t('promoFrom', { date: date(p.startsAt) }) : null,
                    p.endsAt ? t('promoUntil', { date: date(p.endsAt) }) : null,
                    t('promoUses', {
                      used: p.used,
                      limit: p.usageLimit === null ? '∞' : String(p.usageLimit),
                    }),
                    t('promoCost', { amount: money(p.discountTotalTiyin) }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {p.description ? <span>{p.description}</span> : null}
              </div>
              <PromoToggle id={p.id} active={p.active} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
