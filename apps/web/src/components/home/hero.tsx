import { Badge } from '@uzgo/ui/components/badge';
import { Button } from '@uzgo/ui/components/button';
import { cn } from '@uzgo/ui/lib/cn';
import { ChevronRight } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { HeroArt } from '@/components/art/service-art';
import { CategoryIcon } from '@/components/category-icon';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { getCategoryTreeSafe } from '@/lib/catalog-api';
import { categoryTint } from '@/lib/category-style';

const PROMOS = [
  { key: 'banner2', href: '/info/sell', tone: 'from-[#024d32] via-[#03653f] to-[#047a4e]' },
  { key: 'banner3', href: '/info/help', tone: 'from-[#0a1f4d] via-[#0f2e6e] to-[#143c8f]' },
] as const;

/**
 * Desktop: category sidebar · main banner · two promo cards.
 * Mobile: swipeable banners (sidebar lives in the catalog sheet).
 */
export async function Hero() {
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const categories = await getCategoryTreeSafe();

  return (
    <section aria-label={t('home.bannersLabel')} className="grid gap-3 lg:grid-cols-[15rem_1fr]">
      <nav
        aria-label={t('header.allCategories')}
        className="hidden rounded-xl border border-border bg-card p-2 lg:block"
      >
        <ul className="flex flex-col">
          {categories.map((category) => (
            <li key={category.slug}>
              <Link
                href={`/c/${category.slug}`}
                className="group flex min-h-10 items-center gap-3 rounded-lg px-2 text-sm font-medium hover:bg-muted"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-8 items-center justify-center rounded-md',
                    categoryTint(category.icon),
                  )}
                >
                  <CategoryIcon icon={category.icon} className="size-4.5" />
                </span>
                <span className="flex-1">{category.name[locale]}</span>
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-3 md:grid-rows-2 md:overflow-visible md:px-0">
        <li className="relative isolate flex w-[88%] shrink-0 snap-center overflow-hidden rounded-xl bg-gradient-to-br from-[#0f2e6e] via-[#143c8f] to-[#2c63d6] p-5 text-white md:col-span-2 md:row-span-2 md:w-auto md:p-8">
          <div className="relative z-10 flex flex-col justify-between gap-6 md:max-w-[55%]">
            <div className="flex flex-col gap-2 md:gap-3">
              <Badge className="bg-white/15 text-white">{t('common.demo')}</Badge>
              <h2 className="text-xl leading-tight font-bold text-balance md:text-4xl">
                {t('home.banner1Title')}
              </h2>
              <p className="text-sm text-white/85 md:text-base">{t('home.banner1Text')}</p>
            </div>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="w-fit border-0 bg-white text-[#0f2e6e] hover:bg-white/90 md:h-11 md:px-5"
            >
              <Link href="/catalog">{t('home.banner1Cta')}</Link>
            </Button>
          </div>
          <HeroArt className="pointer-events-none absolute right-0 bottom-0 hidden h-[92%] w-[46%] md:block" />
        </li>
        {PROMOS.map((promo) => (
          <li
            key={promo.key}
            className={cn(
              'relative isolate flex w-[88%] shrink-0 snap-center flex-col justify-between gap-6 overflow-hidden rounded-xl bg-gradient-to-br p-5 text-white md:w-auto',
              promo.tone,
            )}
          >
            <div className="flex flex-col gap-2">
              <Badge className="bg-white/15 text-white">{t('common.demo')}</Badge>
              <h2 className="text-lg leading-tight font-bold text-balance">
                {t(`home.${promo.key}Title`)}
              </h2>
              <p className="text-sm text-white/85">{t(`home.${promo.key}Text`)}</p>
            </div>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="w-fit border-0 bg-white text-[#0f2e6e] hover:bg-white/90"
            >
              <Link href={promo.href}>{t(`home.${promo.key}Cta`)}</Link>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
