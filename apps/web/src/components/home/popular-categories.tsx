import { cn } from '@uzgo/ui/lib/cn';
import { getLocale, getTranslations } from 'next-intl/server';
import { CategoryIcon } from '@/components/category-icon';
import { categories } from '@/fixtures/catalog';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { CATEGORY_TINT } from '@/lib/category-style';
import { SectionHeader } from './section-header';

export async function PopularCategories() {
  const t = await getTranslations('home');
  const locale = (await getLocale()) as Locale;

  return (
    <section aria-labelledby="popular-categories">
      <SectionHeader
        id="popular-categories"
        title={t('popularCategories')}
        viewAll={{ href: '/search', label: t('viewAll') }}
      />
      <ul className="grid grid-cols-4 gap-2 sm:gap-3 lg:grid-cols-8">
        {categories.map((category) => (
          <li key={category.slug}>
            <Link
              href={{ pathname: '/search', query: { category: category.slug } }}
              className="group flex h-full flex-col items-center gap-2 rounded-xl p-1.5 text-center hover:bg-muted"
            >
              <span
                className={cn(
                  'flex aspect-square w-full items-center justify-center rounded-2xl transition-transform duration-(--duration-base) group-hover:scale-105 motion-reduce:transition-none',
                  CATEGORY_TINT[category.icon],
                )}
              >
                <CategoryIcon
                  name={category.icon}
                  className="size-7 md:size-9"
                  strokeWidth={1.75}
                />
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
