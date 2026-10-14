import { Badge } from '@uzgo/ui/components/badge';
import { Store } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Breadcrumbs } from '@/components/catalog/breadcrumbs';
import { ProductListing } from '@/components/catalog/product-listing';
import type { Locale } from '@/i18n/routing';
import { getStore, NotFoundError } from '@/lib/catalog-api';
import { parseListingParams } from '@/lib/listing-params';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function load(slug: string) {
  try {
    return await getStore(slug);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ slug }, locale] = await Promise.all([params, getLocale()]);
  const store = await load(slug);
  return {
    title: store.name[locale as Locale],
    alternates: {
      canonical: `/${locale}/s/${slug}`,
      languages: { uz: `/uz/s/${slug}`, ru: `/ru/s/${slug}` },
    },
  };
}

export default async function StorePage({ params, searchParams }: Props) {
  const [{ slug }, t, locale, query] = await Promise.all([
    params,
    getTranslations(),
    getLocale(),
    searchParams,
  ]);
  const l = locale as Locale;
  const store = await load(slug);
  const place = [store.district?.[l], store.region?.[l]].filter(Boolean).join(', ');

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <Breadcrumbs items={[{ label: store.name[l] }]} />
      <header className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-5">
        <span
          aria-hidden="true"
          className="flex size-14 items-center justify-center rounded-xl bg-accent text-accent-foreground"
        >
          <Store className="size-7" />
        </span>
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{store.name[l]}</h1>
            {store.isDemo ? <Badge variant="muted">{t('common.demo')}</Badge> : null}
          </div>
          {place ? (
            <p className="text-sm text-muted-foreground">
              {t('store.location')}: {place}
            </p>
          ) : null}
          {store.isDemo ? (
            <p className="text-sm text-muted-foreground">{t('store.demoStore')}</p>
          ) : null}
        </div>
      </header>
      <h2 className="mb-4 text-lg font-semibold">{t('store.products')}</h2>
      <ProductListing
        basePath={`/s/${slug}`}
        query={parseListingParams(query)}
        scope={{ store: slug }}
      />
    </div>
  );
}
