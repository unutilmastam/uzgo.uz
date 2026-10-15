import { PRODUCT_STATUSES, type ProductStatus } from '@uzgo/contracts';
import { Button } from '@uzgo/ui/components/button';
import { EmptyState } from '@uzgo/ui/components/empty-state';
import { Pagination } from '@uzgo/ui/components/pagination';
import { Price } from '@uzgo/ui/components/price';
import { cn } from '@uzgo/ui/lib/cn';
import { ImageOff, PackagePlus, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { ProductStatusBadge } from '@/components/seller/status-badges';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { getSellerProducts } from '@/lib/seller-api';
import { loadSellerStore } from './store-context';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('seller');
  return { title: t('tabProducts'), robots: { index: false } };
}

export default async function SellerProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const [{ storeId }, query] = await Promise.all([params, searchParams]);
  const { store, readOnly } = await loadSellerStore(storeId, `/seller/${storeId}`);
  const status = PRODUCT_STATUSES.includes(query.status as ProductStatus)
    ? (query.status as ProductStatus)
    : undefined;
  const page = Math.min(Math.max(Number.parseInt(query.page ?? '1', 10) || 1, 1), 1000);
  const [t, locale, list] = await Promise.all([
    getTranslations(),
    getLocale() as Promise<Locale>,
    getSellerProducts(store.id, { status, page }),
  ]);
  if (!list) notFound();
  const base = `/seller/${store.id}`;
  const href = (next: { status?: ProductStatus | undefined; page?: number }) => {
    const params = new URLSearchParams();
    if (next.status) params.set('status', next.status);
    if (next.page && next.page > 1) params.set('page', String(next.page));
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label={t('seller.tabProducts')} className="-mx-1 flex flex-wrap gap-1">
          {[undefined, ...PRODUCT_STATUSES].map((s) => (
            <Link
              key={s ?? 'all'}
              href={href({ status: s })}
              aria-current={s === status ? 'page' : undefined}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm',
                s === status ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-secondary',
              )}
            >
              {s ? t(`seller.ps_${s}`) : t('seller.all')}
            </Link>
          ))}
        </nav>
        {readOnly ? null : (
          <Button asChild>
            <Link href={`${base}/products/new`}>
              <Plus aria-hidden="true" />
              {t('seller.newProduct')}
            </Link>
          </Button>
        )}
      </div>

      {list.items.length === 0 ? (
        <EmptyState icon={<PackagePlus />} title={t('seller.noProducts')} />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {list.items.map((product) => (
            <li key={product.id}>
              <Link
                href={`${base}/products/${product.id}`}
                className="flex items-center gap-4 p-4 hover:bg-muted/50"
              >
                <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                  {product.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- small seller thumbnail
                    <img
                      src={product.image}
                      alt=""
                      className="size-full object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <ImageOff aria-hidden="true" className="size-6 text-muted-foreground" />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate font-medium">{product.title[locale]}</span>
                  <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <ProductStatusBadge status={product.status} />
                    <span>{t('seller.variantsShort', { count: product.variantCount })}</span>
                    <span>{t('seller.stockShort', { count: product.totalStock })}</span>
                  </span>
                  {product.status === 'REJECTED' && product.moderationNote ? (
                    <span className="text-sm text-destructive">
                      {t('seller.moderationNote', { note: product.moderationNote })}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right font-semibold">
                  {product.minPriceTiyin ? (
                    <Price value={product.minPriceTiyin} locale={locale} />
                  ) : (
                    <span className="text-sm text-muted-foreground">{t('seller.noPrice')}</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pagination
        page={list.page}
        pageCount={Math.ceil(list.total / list.pageSize)}
        linkAs={Link}
        hrefFor={(p) => href({ status, page: p })}
        labels={{
          nav: t('pagination.nav'),
          previous: t('pagination.previous'),
          next: t('pagination.next'),
          page: (p) => t('pagination.page', { page: p }),
        }}
      />
    </div>
  );
}
