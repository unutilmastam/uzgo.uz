import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CartScreen } from '@/components/cart/cart-screen';
import { PageShell } from '@/components/page-shell';
import { getCurrentUser } from '@/lib/api-server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('cart');
  return { title: t('title'), robots: { index: false } };
}

export default async function CartPage() {
  const [t, user] = await Promise.all([
    getTranslations('cart'),
    getCurrentUser().catch(() => null),
  ]);
  return (
    <PageShell title={t('title')}>
      <CartScreen loggedIn={user !== null} />
    </PageShell>
  );
}
