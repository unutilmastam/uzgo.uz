import { Badge } from '@uzgo/ui/components/badge';
import { ProductCard } from '@uzgo/ui/components/product-card';
import { getLocale, getTranslations } from 'next-intl/server';
import { CategoryIcon } from '@/components/category-icon';
import { categories, products } from '@/fixtures/catalog';
import type { Locale } from '@/i18n/routing';
import { AddToCartButton } from './add-to-cart-button';

export async function ProductGrid() {
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const iconFor = (slug: string) => categories.find((c) => c.slug === slug)?.icon ?? 'sparkles';

  return (
    <section aria-labelledby="recommended">
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id="recommended" className="text-xl font-bold md:text-2xl">
          {t('home.recommended')}
        </h2>
        <Badge variant="muted">{t('common.demo')}</Badge>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{t('common.demoNotice')}</p>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
        {products.map((product) => {
          const title = product.title[locale];
          return (
            <li key={product.id} className="flex">
              <ProductCard
                className="w-full"
                title={title}
                price={product.priceTiyin}
                {...(product.oldPriceTiyin ? { oldPrice: product.oldPriceTiyin } : {})}
                locale={locale}
                storeName={product.store}
                image={
                  <div className="flex size-full items-center justify-center bg-gradient-to-br from-secondary to-muted text-primary/70">
                    <CategoryIcon name={iconFor(product.category)} className="size-14" />
                  </div>
                }
                badges={<Badge variant="muted">{t('common.demo')}</Badge>}
                labels={{
                  oldPrice: t('product.oldPrice'),
                  discount: (percent) => t('product.discount', { percent }),
                }}
                action={<AddToCartButton title={title} />}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
