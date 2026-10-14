import { cn } from '@uzgo/ui/lib/cn';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Breadcrumbs } from '@/components/catalog/breadcrumbs';
import { CategoryIcon } from '@/components/category-icon';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { getCategoryTree } from '@/lib/catalog-api';
import { categoryTint } from '@/lib/category-style';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('catalog');
  return { title: t('title') };
}

export default async function CatalogPage() {
  const [t, locale, categories] = await Promise.all([
    getTranslations(),
    getLocale(),
    getCategoryTree(),
  ]);
  const l = locale as Locale;
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <Breadcrumbs items={[{ label: t('catalog.title') }]} />
      <h1 className="mb-6 text-2xl font-bold md:text-3xl">{t('catalog.title')}</h1>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {categories.map((category) => (
          <li key={category.slug} className="rounded-xl border border-border bg-card p-4">
            <Link href={`/c/${category.slug}`} className="group flex items-center gap-3">
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-12 items-center justify-center rounded-xl',
                  categoryTint(category.icon),
                )}
              >
                <CategoryIcon icon={category.icon} className="size-6" />
              </span>
              <span className="text-base font-semibold group-hover:text-primary">
                {category.name[l]}
              </span>
            </Link>
            <ul className="mt-3 flex flex-col">
              {category.children.map((child) => (
                <li key={child.slug}>
                  <Link
                    href={`/c/${child.slug}`}
                    className="inline-flex min-h-9 items-center text-sm text-muted-foreground hover:text-foreground"
                  >
                    {child.name[l]}
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
