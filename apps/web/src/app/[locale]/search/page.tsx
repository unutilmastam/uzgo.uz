import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Breadcrumbs } from '@/components/catalog/breadcrumbs';
import { ProductListing } from '@/components/catalog/product-listing';
import type { Locale } from '@/i18n/routing';
import { getCategory, NotFoundError } from '@/lib/catalog-api';
import { parseListingParams } from '@/lib/listing-params';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const t = await getTranslations('search');
  const { q } = parseListingParams(await searchParams);
  // Search result pages are never indexed.
  return { title: q ? t('resultsFor', { query: q }) : t('title'), robots: { index: false } };
}

export default async function SearchPage({ searchParams }: Props) {
  const [t, locale, params] = await Promise.all([getTranslations(), getLocale(), searchParams]);
  const query = parseListingParams(params);
  let filters: Awaited<ReturnType<typeof getCategory>>['filters'] = [];
  let categoryName: string | undefined;
  if (query.category) {
    try {
      const category = await getCategory(query.category);
      filters = category.filters;
      categoryName = category.category.name[locale as Locale];
    } catch (error) {
      if (error instanceof NotFoundError) notFound();
      throw error;
    }
  }
  const title = query.q
    ? t('search.resultsFor', { query: query.q })
    : (categoryName ?? t('search.title'));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <Breadcrumbs items={[{ label: t('search.title') }]} />
      <h1 className="mb-6 text-2xl font-bold md:text-3xl">{title}</h1>
      <ProductListing basePath="/search" query={query} filters={filters} />
    </div>
  );
}
