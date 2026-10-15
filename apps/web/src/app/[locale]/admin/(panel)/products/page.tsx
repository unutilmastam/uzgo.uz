import { PRODUCT_STATUSES, type ProductStatus } from '@uzgo/contracts';
import { EmptyState } from '@uzgo/ui/components/empty-state';
import { Pagination } from '@uzgo/ui/components/pagination';
import { Price } from '@uzgo/ui/components/price';
import { ImageOff, ListChecks } from 'lucide-react';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { StatusFilter } from '@/components/panel/status-filter';
import { ProductStatusBadge } from '@/components/seller/status-badges';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { getAdminProducts } from '@/lib/admin-api';
import { requireStaff } from '../../staff';

/** Moderation queue (oldest submission first). */
export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requireStaff('/admin/products');
  const query = await searchParams;
  const status = PRODUCT_STATUSES.includes(query.status as ProductStatus)
    ? (query.status as ProductStatus)
    : 'PENDING_REVIEW';
  const page = Math.max(Number.parseInt(query.page ?? '1', 10) || 1, 1);
  const [t, locale, format, list] = await Promise.all([
    getTranslations(),
    getLocale() as Promise<Locale>,
    getFormatter(),
    getAdminProducts(status, page),
  ]);
  const href = (s: string, p = 1) =>
    `/admin/products?${new URLSearchParams({ status: s, ...(p > 1 ? { page: String(p) } : {}) }).toString()}`;

  return (
    <div className="flex flex-col gap-4">
      <StatusFilter
        label={t('admin.tabProducts')}
        current={status}
        options={PRODUCT_STATUSES.map((s) => ({
          value: s,
          label: t(`seller.ps_${s}`),
          href: href(s),
        }))}
      />
      {!list || list.items.length === 0 ? (
        <EmptyState icon={<ListChecks />} title={t('admin.empty')} />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {list.items.map((product) => (
            <li key={product.id}>
              <Link
                href={`/admin/products/${product.id}`}
                className="flex items-center gap-4 p-4 hover:bg-muted/50"
              >
                <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                  {product.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- moderation thumbnail
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
                    <span>{product.store.name[locale]}</span>
                    <span>{product.category.name[locale]}</span>
                    {product.submittedAt ? (
                      <span>
                        {t('admin.submittedAt', {
                          date: format.dateTime(new Date(product.submittedAt), {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }),
                        })}
                      </span>
                    ) : null}
                  </span>
                </span>
                {product.minPriceTiyin ? (
                  <span className="shrink-0 font-semibold">
                    <Price value={product.minPriceTiyin} locale={locale} />
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {list ? (
        <Pagination
          page={list.page}
          pageCount={Math.ceil(list.total / list.pageSize)}
          linkAs={Link}
          hrefFor={(p) => href(status, p)}
          labels={{
            nav: t('pagination.nav'),
            previous: t('pagination.previous'),
            next: t('pagination.next'),
            page: (p) => t('pagination.page', { page: p }),
          }}
        />
      ) : null}
    </div>
  );
}
