import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { CheckoutForm } from '@/components/checkout/checkout-form';
import { PageShell } from '@/components/page-shell';
import { redirect } from '@/i18n/navigation';
import { getCurrentUser, getPaymentMethods, getRegions } from '@/lib/api-server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('checkout');
  return { title: t('title'), robots: { index: false } };
}

/** Protected: login is checked on the server. */
export default async function CheckoutPage() {
  const [t, locale, user] = await Promise.all([
    getTranslations('checkout'),
    getLocale(),
    getCurrentUser(),
  ]);
  if (!user) redirect({ href: { pathname: '/login', query: { next: '/checkout' } }, locale });
  if (!user) return null;
  const [regions, payment] = await Promise.all([getRegions(), getPaymentMethods()]);
  return (
    <PageShell title={t('title')}>
      <CheckoutForm
        user={user}
        regions={regions}
        methods={payment.items}
        paymentWindowMinutes={payment.windowMinutes}
      />
    </PageShell>
  );
}
