import { Price } from '@uzgo/ui/components/price';
import { FlaskConical } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { DevPayButtons } from '@/components/orders/dev-pay-buttons';
import type { Locale } from '@/i18n/routing';
import { getMyOrder, getPaymentMethods } from '@/lib/api-server';
import { requireUser } from '@/lib/require-user';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('devPay');
  return { title: t('title'), robots: { index: false, follow: false } };
}

/**
 * DEVELOPMENT ONLY: simulated payment page. 404 unless the API offers the
 * DEV_ONLINE method (refused in production by the API's env validation).
 */
export default async function DevPayPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  await requireUser(`/pay/dev/${number}`);
  const [t, locale, methods] = await Promise.all([
    getTranslations('devPay'),
    getLocale() as Promise<Locale>,
    getPaymentMethods(),
  ]);
  if (!methods.items.includes('DEV_ONLINE') || !/^UZ-\d{4}-\d{6,}$/.test(number)) notFound();
  const order = await getMyOrder(number);
  if (order?.paymentMethod !== 'DEV_ONLINE') notFound();

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="rounded-xl border-2 border-dashed border-warning bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <FlaskConical aria-hidden="true" className="size-6 text-warning" />
          <h1 className="text-xl font-bold">{t('title')}</h1>
        </div>
        <p role="note" className="mb-4 rounded-md bg-warning/15 p-3 text-sm">
          {t('warning')}
        </p>
        <p className="text-sm text-muted-foreground">{t('order', { number: order.number })}</p>
        <Price value={order.totalTiyin} locale={locale} className="mb-6 block text-3xl font-bold" />
        <DevPayButtons orderNumber={order.number} payable={order.payment.status === 'UNPAID'} />
      </div>
    </div>
  );
}
