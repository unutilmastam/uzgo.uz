import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { ImagesManager } from '@/components/seller/images-manager';
import { ProductActions } from '@/components/seller/product-actions';
import { ProductForm } from '@/components/seller/product-form';
import { ProductStatusBadge } from '@/components/seller/status-badges';
import { VariantsManager } from '@/components/seller/variants-manager';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { getCategoryTree } from '@/lib/catalog-api';
import { getSellerProduct } from '@/lib/seller-api';
import { loadSellerStore } from '../../store-context';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('seller');
  return { title: t('productTitle'), robots: { index: false } };
}

export default async function SellerProductPage({
  params,
}: {
  params: Promise<{ storeId: string; productId: string }>;
}) {
  const { storeId, productId } = await params;
  if (!z.uuid().safeParse(productId).success) notFound();
  const { store, readOnly: storeReadOnly } = await loadSellerStore(
    storeId,
    `/seller/${storeId}/products/${productId}`,
  );
  const [t, locale, product, categories] = await Promise.all([
    getTranslations('seller'),
    getLocale() as Promise<Locale>,
    getSellerProduct(store.id, productId),
    getCategoryTree(),
  ]);
  if (!product) notFound();
  const readOnly = storeReadOnly || product.status === 'ARCHIVED';
  const section = 'rounded-xl border border-border bg-card p-5 md:p-6';

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">{product.title[locale]}</h2>
        <ProductStatusBadge status={product.status} />
        {product.status === 'APPROVED' ? (
          <Link
            href={`/p/${product.slug}`}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            {t('viewInStore')}
          </Link>
        ) : null}
      </div>
      {product.moderationNote ? (
        <p role="status" className="rounded-lg bg-sale/10 p-3 text-sm text-destructive">
          {t('moderationNote', { note: product.moderationNote })}
        </p>
      ) : null}
      <ProductActions
        storeId={store.id}
        productId={product.id}
        status={product.status}
        readOnly={storeReadOnly}
      />
      <section aria-labelledby="images" className={section}>
        <h3 id="images" className="mb-3 text-base font-semibold">
          {t('images')}
        </h3>
        <ImagesManager storeId={store.id} product={product} readOnly={readOnly} />
      </section>
      <section aria-labelledby="variants" className={section}>
        <h3 id="variants" className="mb-3 text-base font-semibold">
          {t('variants')}
        </h3>
        <VariantsManager storeId={store.id} product={product} readOnly={readOnly} />
      </section>
      <section aria-labelledby="content" className={section}>
        <h3 id="content" className="mb-3 text-base font-semibold">
          {t('productTitle')}
        </h3>
        {readOnly ? (
          <p className="text-sm text-muted-foreground">
            {storeReadOnly ? t('suspendedNotice') : t('error_PRODUCT_ARCHIVED')}
          </p>
        ) : (
          <ProductForm
            key={product.updatedAt}
            storeId={store.id}
            categories={categories}
            product={product}
          />
        )}
      </section>
    </div>
  );
}
