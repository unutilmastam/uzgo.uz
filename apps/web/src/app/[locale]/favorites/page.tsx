import { Button } from '@uzgo/ui/components/button';
import { EmptyState } from '@uzgo/ui/components/empty-state';
import { Heart } from 'lucide-react';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { ProductTile } from '@/components/catalog/product-tile';
import { PageShell } from '@/components/page-shell';
import { Link, redirect } from '@/i18n/navigation';
import { getCurrentUser, getMyFavorites } from '@/lib/api-server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('favorites');
  return { title: t('title'), robots: { index: false } };
}

export default async function FavoritesPage() {
  const [t, locale, user] = await Promise.all([getTranslations(), getLocale(), getCurrentUser()]);
  if (!user) redirect({ href: { pathname: '/login', query: { next: '/favorites' } }, locale });
  const items = await getMyFavorites();
  return (
    <PageShell title={t('favorites.title')}>
      {items.length === 0 ? (
        <EmptyState
          icon={<Heart />}
          title={t('favorites.emptyTitle')}
          description={t('favorites.emptyDescription')}
          action={
            <Button asChild>
              <Link href="/catalog">{t('cart.cta')}</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((product) => (
            <li key={product.id}>
              <ProductTile product={product} />
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
