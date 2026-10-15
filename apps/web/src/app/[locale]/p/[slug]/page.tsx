import { Badge } from '@uzgo/ui/components/badge';
import { Banknote, Store } from 'lucide-react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Breadcrumbs } from '@/components/catalog/breadcrumbs';
import { CategoryIcon } from '@/components/category-icon';
import { ProductPurchase } from '@/components/product/product-purchase';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { getProduct, NotFoundError } from '@/lib/catalog-api';
import { categoryTint } from '@/lib/category-style';

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  try {
    return await getProduct(slug);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ slug }, locale] = await Promise.all([params, getLocale()]);
  const product = await load(slug);
  const l = locale as Locale;
  return {
    title: product.title[l],
    description: product.description[l].slice(0, 160),
    alternates: {
      canonical: `/${locale}/p/${slug}`,
      languages: { uz: `/uz/p/${slug}`, ru: `/ru/p/${slug}` },
    },
    openGraph: { title: product.title[l], images: product.images.slice(0, 1).map((i) => i.url) },
  };
}

/** JSON for a <script> tag: "<" is escaped so content can never close the tag. */
function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export default async function ProductPage({ params }: Props) {
  const [{ slug }, t, locale] = await Promise.all([params, getTranslations(), getLocale()]);
  const l = locale as Locale;
  const product = await load(slug);
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const prices = product.variants.map((v) => BigInt(v.priceTiyin));
  const lowest = prices.reduce((a, b) => (b < a ? b : a));
  const inStock = product.variants.some((v) => v.available > 0);
  const structured = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title[l],
    description: product.description[l],
    sku: product.variants[0]?.sku,
    ...(product.images[0] ? { image: product.images.map((i) => i.url) } : {}),
    offers: {
      '@type': 'Offer',
      priceCurrency: 'UZS',
      price: (lowest / 100n).toString(),
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: product.store.name[l] },
    },
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: jsonLd(structured) }}
      />
      <Breadcrumbs
        items={[
          { href: '/catalog', label: t('catalog.title') },
          ...product.breadcrumbs.map((b) => ({ href: `/c/${b.slug}`, label: b.name[l] })),
          { href: `/c/${product.category.slug}`, label: product.category.name[l] },
          { label: product.title[l] },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_26rem] lg:gap-10">
        <div className="relative aspect-square overflow-hidden rounded-2xl bg-muted md:aspect-[4/3]">
          {product.images[0] ? (
            // eslint-disable-next-line @next/next/no-img-element -- object storage URLs (see ProductTile)
            <img
              src={product.images[0].url}
              alt={product.images[0].alt?.[l] ?? product.title[l]}
              className="size-full object-contain"
            />
          ) : (
            <div
              className={`flex size-full flex-col items-center justify-center gap-3 ${categoryTint(product.category.icon)}`}
            >
              <CategoryIcon icon={product.category.icon} className="size-24" strokeWidth={1.25} />
              <span className="text-sm">{t('product.noImage')}</span>
            </div>
          )}
          {product.store.isDemo ? (
            <Badge variant="muted" className="absolute top-3 left-3">
              {t('common.demo')}
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl leading-tight font-bold md:text-3xl">{product.title[l]}</h1>
            <Link
              href={`/s/${product.store.slug}`}
              className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <Store aria-hidden="true" className="size-4" />
              {t('product.seller')}:{' '}
              <span className="font-medium text-foreground">{product.store.name[l]}</span>
            </Link>
          </div>
          <ProductPurchase variants={product.variants} />
          <p className="flex items-center gap-2 rounded-lg bg-muted px-4 py-3 text-sm">
            <Banknote aria-hidden="true" className="size-5 text-primary" />
            {t('product.payOnDelivery')}
          </p>
          {product.store.isDemo ? (
            <p className="text-xs text-muted-foreground">{t('product.demoProduct')}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="description">
          <h2 id="description" className="mb-3 text-lg font-semibold">
            {t('product.description')}
          </h2>
          <p className="whitespace-pre-line text-muted-foreground">{product.description[l]}</p>
        </section>
        {product.attributes.length > 0 ? (
          <section aria-labelledby="specs">
            <h2 id="specs" className="mb-3 text-lg font-semibold">
              {t('product.specs')}
            </h2>
            <dl className="divide-y divide-border rounded-lg border border-border">
              {product.attributes.map((a) => (
                <div key={a.attribute} className="flex justify-between gap-4 px-4 py-3 text-sm">
                  <dt className="text-muted-foreground">{a.attributeName[l]}</dt>
                  <dd className="font-medium">{a.name[l]}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
      </div>
    </div>
  );
}
