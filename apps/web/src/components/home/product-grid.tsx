import { Badge } from '@uzgo/ui/components/badge';
import { getTranslations } from 'next-intl/server';
import { ProductTile } from '@/components/catalog/product-tile';
import { getProducts } from '@/lib/catalog-api';
import { SectionHeader } from './section-header';

export async function ProductGrid() {
  const t = await getTranslations();
  const result = await getProducts({ sort: 'newest', pageSize: 10 }).catch(() => null);
  if (!result || result.items.length === 0) return null;
  const hasDemo = result.items.some((p) => p.store.isDemo);

  return (
    <section aria-labelledby="recommended">
      <SectionHeader
        id="recommended"
        title={t('home.recommended')}
        extra={hasDemo ? <Badge variant="muted">{t('common.demo')}</Badge> : undefined}
        viewAll={{ href: '/search', label: t('home.viewAll') }}
      />
      {hasDemo ? (
        <p className="-mt-2 mb-4 text-sm text-muted-foreground">{t('common.demoNotice')}</p>
      ) : null}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
        {result.items.map((product, index) => (
          <li key={product.id} className="flex">
            <ProductTile product={product} priority={index < 2} />
          </li>
        ))}
      </ul>
    </section>
  );
}
