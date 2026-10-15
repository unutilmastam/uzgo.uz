import { formatPrice } from '@uzgo/ui/lib/money';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { AdminAction } from '@/components/admin/admin-action';
import { ProductStatusBadge, StoreStatusBadge } from '@/components/seller/status-badges';
import type { Locale } from '@/i18n/routing';
import { getAdminProduct } from '@/lib/admin-api';
import { requireStaff } from '../../../staff';

/** Everything a moderator needs to decide: content, images, prices, the store. */
export default async function AdminProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  await requireStaff(`/admin/products/${id}`);
  const [t, locale, product] = await Promise.all([
    getTranslations('admin'),
    getLocale() as Promise<Locale>,
    getAdminProduct(id),
  ]);
  if (!product) notFound();
  const section = 'rounded-xl border border-border bg-card p-5';

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">{product.title[locale]}</h2>
        <ProductStatusBadge status={product.status} />
      </div>
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t('store')}</span>
        <span className="font-medium">{product.store.name[locale]}</span>
        <StoreStatusBadge status={product.store.status} />
        <span className="text-muted-foreground">{t('category')}</span>
        <span className="font-medium">{product.category.name[locale]}</span>
      </p>
      <div className="flex flex-wrap items-start gap-2">
        {product.status === 'PENDING_REVIEW' ? (
          <AdminAction
            path={`/admin/products/${product.id}/approve`}
            label={t('approve')}
            variant="primary"
          />
        ) : null}
        {product.status === 'PENDING_REVIEW' ? (
          <AdminAction
            path={`/admin/products/${product.id}/reject`}
            label={t('reject')}
            withReason
          />
        ) : null}
        {product.status === 'APPROVED' ? (
          <AdminAction
            path={`/admin/products/${product.id}/reject`}
            label={t('takeDown')}
            withReason
            variant="destructive"
          />
        ) : null}
      </div>
      <section aria-labelledby="images" className={section}>
        <h3 id="images" className="mb-3 font-semibold">
          {t('images')}
        </h3>
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {product.images.map((image, index) => (
            <li key={image.id} className="overflow-hidden rounded-lg border border-border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element -- moderation preview */}
              <img
                src={image.url}
                alt={t('imageAlt', { index: index + 1 })}
                className="aspect-square w-full object-contain"
              />
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="variants" className={section}>
        <h3 id="variants" className="mb-3 font-semibold">
          {t('variants')}
        </h3>
        <ul className="flex flex-col gap-1 text-sm">
          {product.variants.map((variant) => (
            <li key={variant.id}>
              {t('variantLine', {
                sku: variant.sku,
                price: formatPrice(variant.priceTiyin, locale),
                stock: variant.stock,
              })}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="description" className={section}>
        <h3 id="description" className="mb-3 font-semibold">
          {t('description')}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <p lang="uz" className="text-sm whitespace-pre-line">
            {product.description.uz}
          </p>
          <p lang="ru" className="text-sm whitespace-pre-line">
            {product.description.ru}
          </p>
        </div>
      </section>
    </div>
  );
}
