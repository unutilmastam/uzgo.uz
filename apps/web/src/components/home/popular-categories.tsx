import { getLocale, getTranslations } from 'next-intl/server';
import { CategoryIcon } from '@/components/category-icon';
import { categories } from '@/fixtures/catalog';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';

export async function PopularCategories() {
  const t = await getTranslations('home');
  const locale = (await getLocale()) as Locale;

  return (
    <section aria-labelledby="popular-categories">
      <h2 id="popular-categories" className="mb-4 text-xl font-bold md:text-2xl">
        {t('popularCategories')}
      </h2>
      <ul className="grid grid-cols-4 gap-2 sm:gap-3 lg:grid-cols-8">
        {categories.map((category) => (
          <li key={category.slug}>
            <Link
              href={{ pathname: '/search', query: { category: category.slug } }}
              className="group flex h-full flex-col items-center gap-2 rounded-lg p-2 text-center hover:bg-muted"
            >
              <span className="flex aspect-square w-full max-w-20 items-center justify-center rounded-xl bg-secondary text-primary transition-transform duration-(--duration-base) group-hover:scale-105 motion-reduce:transition-none">
                <CategoryIcon name={category.icon} className="size-7 md:size-8" />
              </span>
              <span className="text-xs leading-tight font-medium sm:text-sm">
                {category.name[locale]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
