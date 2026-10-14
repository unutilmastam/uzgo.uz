import type { CatalogFilter, ProductSort } from '@uzgo/contracts';
import { Button } from '@uzgo/ui/components/button';
import { EmptyState } from '@uzgo/ui/components/empty-state';
import { Input } from '@uzgo/ui/components/input';
import { Pagination } from '@uzgo/ui/components/pagination';
import { cn } from '@uzgo/ui/lib/cn';
import { SlidersHorizontal, SearchX } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { getProducts, type ListingQuery } from '@/lib/catalog-api';
import { listingSearch } from '@/lib/listing-params';
import { ProductTile } from './product-tile';

const PAGE_SIZE = 24;

type Props = {
  /** Locale-less path of the page, e.g. "/c/smartphones". */
  basePath: string;
  query: ListingQuery & { sort?: ProductSort };
  /** Fixed scope that is not part of the URL (category page, store page). */
  scope?: { category?: string; store?: string };
  filters?: CatalogFilter[];
};

/**
 * Server-rendered listing: filters are a plain GET form and sorting/paging are
 * links, so everything works without JavaScript.
 */
export async function ProductListing({ basePath, query, scope = {}, filters = [] }: Props) {
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const result = await getProducts({ ...query, ...scope, pageSize: PAGE_SIZE });
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  const activeSort: ProductSort = query.sort ?? (query.q ? 'relevance' : 'newest');
  const sorts: ProductSort[] = query.q
    ? ['relevance', 'newest', 'price_asc', 'price_desc']
    : ['newest', 'price_asc', 'price_desc'];
  const selected = new Set(query.attr ?? []);
  const hasFilters = selected.size > 0 || Boolean(query.minPrice) || Boolean(query.maxPrice);

  // Rendered twice (desktop sidebar, mobile panel): ids are prefixed to stay unique.
  const filterForm = (prefix: string) => (
    <form method="get" className="flex flex-col gap-5">
      {query.q ? <input type="hidden" name="q" value={query.q} /> : null}
      {query.category && !scope.category ? (
        <input type="hidden" name="category" value={query.category} />
      ) : null}
      {query.sort ? <input type="hidden" name="sort" value={query.sort} /> : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">{t('listing.price')}</legend>
        <div className="flex items-center gap-2">
          <Input
            name="minPrice"
            inputMode="numeric"
            pattern="\d*"
            defaultValue={query.minPrice ?? ''}
            placeholder={t('listing.priceFrom')}
            aria-label={`${t('listing.price')} ${t('listing.priceFrom')}`}
            className="h-10"
          />
          <span aria-hidden="true">—</span>
          <Input
            name="maxPrice"
            inputMode="numeric"
            pattern="\d*"
            defaultValue={query.maxPrice ?? ''}
            placeholder={t('listing.priceTo')}
            aria-label={`${t('listing.price')} ${t('listing.priceTo')}`}
            className="h-10"
          />
        </div>
      </fieldset>
      {filters
        .filter((f) => f.values.length > 0)
        .map((filter) => (
          <fieldset key={filter.code} className="flex flex-col gap-1">
            <legend className="mb-2 text-sm font-semibold">{filter.name[locale]}</legend>
            {filter.values.map((value) => {
              const id = `${prefix}-${filter.code}-${value.code}`;
              const pair = `${filter.code}:${value.code}`;
              return (
                <label
                  key={id}
                  htmlFor={id}
                  className="flex min-h-9 cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    id={id}
                    type="checkbox"
                    name="attr"
                    value={pair}
                    defaultChecked={selected.has(pair)}
                    className="size-4 accent-(--primary)"
                  />
                  {value.name[locale]}
                </label>
              );
            })}
          </fieldset>
        ))}
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          {t('listing.apply')}
        </Button>
        {hasFilters ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={`${basePath}${listingSearch({ ...(query.q ? { q: query.q } : {}) })}`}>
              {t('listing.reset')}
            </Link>
          </Button>
        ) : null}
      </div>
    </form>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
      <aside className="hidden lg:block">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
          <SlidersHorizontal aria-hidden="true" className="size-4" />
          {t('listing.filters')}
        </h2>
        {filterForm('fd')}
      </aside>
      <div className="flex min-w-0 flex-col gap-4">
        <details className="rounded-lg border border-border bg-card lg:hidden">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 text-sm font-semibold">
            <SlidersHorizontal aria-hidden="true" className="size-4" />
            {t('listing.filters')}
          </summary>
          <div className="border-t border-border p-4">{filterForm('fm')}</div>
        </details>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground" role="status">
            {t('listing.results', { count: result.total })}
          </p>
          <nav
            aria-label={t('listing.sort')}
            className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none]"
          >
            {sorts.map((sort) => (
              <Link
                key={sort}
                href={`${basePath}${listingSearch(query, { sort, page: undefined })}`}
                aria-current={sort === activeSort ? 'true' : undefined}
                className={cn(
                  'inline-flex h-9 items-center rounded-full border px-3 text-sm whitespace-nowrap',
                  sort === activeSort
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border hover:bg-muted',
                )}
              >
                {t(`listing.sort_${sort}`)}
              </Link>
            ))}
          </nav>
        </div>
        {result.items.length === 0 ? (
          <EmptyState
            icon={<SearchX />}
            title={t('listing.emptyTitle')}
            description={t('listing.emptyDescription')}
          />
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-4">
            {result.items.map((product, index) => (
              <li key={product.id} className="flex">
                <ProductTile product={product} priority={index < 4} />
              </li>
            ))}
          </ul>
        )}
        <Pagination
          className="mt-4"
          page={result.page}
          pageCount={pageCount}
          linkAs={Link}
          hrefFor={(page) =>
            `${basePath}${listingSearch(query, { page: page > 1 ? String(page) : undefined })}`
          }
          labels={{
            nav: t('pagination.nav'),
            previous: t('pagination.previous'),
            next: t('pagination.next'),
            page: (page) => t('pagination.page', { page }),
          }}
        />
      </div>
    </div>
  );
}
