import { Badge } from '@uzgo/ui/components/badge';
import { ProductCard } from '@uzgo/ui/components/product-card';
import { getLocale, getTranslations } from 'next-intl/server';
import { CategoryIcon } from '@/components/category-icon';
import { categories, products } from '@/fixtures/catalog';
import type { Locale } from '@/i18n/routing';
import { CATEGORY_TINT } from '@/lib/category-style';
import { AddToCartButton } from './add-to-cart-button';
import { SectionHeader } from './section-header';

export async function ProductGrid() {
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const iconFor = (slug: string) => categories.find((c) => c.slug === slug)?.icon ?? 'sparkles';

  return (
    <section aria-labelledby="recommended">
      <SectionHeader
        id="recommended"
        title={t('home.recommended')}
        extra={<Badge variant="muted">{t('common.demo')}</Badge>}
        viewAll={{ href: '/search', label: t('home.viewAll') }}
      />
      <p className="-mt-2 mb-4 text-sm text-muted-foreground">{t('common.demoNotice')}</p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
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
                  <div
                    className={`flex size-full items-center justify-center ${CATEGORY_TINT[iconFor(product.category)]}`}
                  >
                    <CategoryIcon
                      name={iconFor(product.category)}
                      className="size-16"
                      strokeWidth={1.5}
                    />
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
