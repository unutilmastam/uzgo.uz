import type { ProductSummary } from '@uzgo/contracts';
import { Badge } from '@uzgo/ui/components/badge';
import { ProductCard } from '@uzgo/ui/components/product-card';
import { getLocale, getTranslations } from 'next-intl/server';
import { CategoryIcon } from '@/components/category-icon';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { categoryTint } from '@/lib/category-style';

export async function ProductTile({
  product,
  priority = false,
}: {
  product: ProductSummary;
  priority?: boolean;
}) {
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const title = product.title[locale];

  return (
    <ProductCard
      className="h-full w-full"
      title={title}
      href={`/p/${product.slug}`}
      linkAs={Link}
      price={product.priceTiyin}
      {...(product.compareAtPriceTiyin ? { oldPrice: product.compareAtPriceTiyin } : {})}
      locale={locale}
      storeName={product.store.name[locale]}
      image={
        product.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- object storage URLs; next/image config comes with the CDN (Phase 7)
          <img
            src={product.image.url}
            alt={product.image.alt?.[locale] ?? title}
            loading={priority ? 'eager' : 'lazy'}
            className="size-full object-cover"
          />
        ) : (
          <div
            className={`flex size-full items-center justify-center ${categoryTint(product.categoryIcon)}`}
          >
            <CategoryIcon icon={product.categoryIcon} className="size-14" strokeWidth={1.5} />
          </div>
        )
      }
      badges={product.store.isDemo ? <Badge variant="muted">{t('common.demo')}</Badge> : null}
      labels={{
        oldPrice: t('product.oldPrice'),
        discount: (percent) => t('product.discount', { percent }),
      }}
    />
  );
}
