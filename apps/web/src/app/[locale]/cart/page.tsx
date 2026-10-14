import { Button } from '@uzgo/ui/components/button';
import { EmptyState } from '@uzgo/ui/components/empty-state';
import { ShoppingCart } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageShell } from '@/components/page-shell';
import { Link } from '@/i18n/navigation';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('cart');
  return { title: t('title') };
}

export default async function CartPage() {
  const t = await getTranslations('cart');
  return (
    <PageShell title={t('title')}>
      <EmptyState
        icon={<ShoppingCart />}
        title={t('emptyTitle')}
        description={t('emptyDescription')}
        action={
          <Button asChild>
            <Link href="/">{t('cta')}</Link>
          </Button>
        }
      />
    </PageShell>
  );
}
