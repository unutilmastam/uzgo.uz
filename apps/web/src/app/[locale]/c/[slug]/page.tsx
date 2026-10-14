import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Breadcrumbs } from '@/components/catalog/breadcrumbs';
import { ProductListing } from '@/components/catalog/product-listing';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { getCategory, NotFoundError } from '@/lib/catalog-api';
import { parseListingParams } from '@/lib/listing-params';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function load(slug: string) {
  try {
    return await getCategory(slug);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, locale, query] = await Promise.all([params, getLocale(), searchParams]);
  const { category } = await load(slug);
  const name = category.name[locale as Locale];
  const filtered = Object.keys(query).length > 0;
  return {
    title: name,
    description: name,
    alternates: {
      canonical: `/${locale}/c/${slug}`,
      languages: { uz: `/uz/c/${slug}`, ru: `/ru/c/${slug}` },
    },
    // Filtered/sorted/paged variants are not indexed (avoid duplicate content).
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ slug }, t, locale, query] = await Promise.all([
    params,
    getTranslations(),
    getLocale(),
    searchParams,
  ]);
  const l = locale as Locale;
  const detail = await load(slug);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <Breadcrumbs
        items={[
          { href: '/catalog', label: t('catalog.title') },
          ...detail.breadcrumbs.map((b) => ({ href: `/c/${b.slug}`, label: b.name[l] })),
          { label: detail.category.name[l] },
        ]}
      />
      <h1 className="mb-4 text-2xl font-bold md:text-3xl">{detail.category.name[l]}</h1>
      {detail.children.length > 0 ? (
        <nav
          aria-label={t('catalog.subcategories')}
          className="mb-6 -mx-4 overflow-x-auto px-4 [scrollbar-width:none]"
        >
          <ul className="flex gap-2">
            {detail.children.map((child) => (
              <li key={child.slug}>
                <Link
                  href={`/c/${child.slug}`}
                  className="inline-flex h-10 items-center rounded-full bg-secondary px-4 text-sm font-medium whitespace-nowrap text-secondary-foreground hover:bg-secondary-hover"
                >
                  {child.name[l]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <ProductListing
        basePath={`/c/${slug}`}
        query={parseListingParams(query)}
        scope={{ category: slug }}
        filters={detail.filters}
      />
    </div>
  );
}
