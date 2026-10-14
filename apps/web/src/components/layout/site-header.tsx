import { Logo } from '@uzgo/ui/components/logo';
import { ShoppingCart, UserRound } from 'lucide-react';
import { connection } from 'next/server';
import { getLocale, getTranslations } from 'next-intl/server';
import { CartCount } from '@/components/cart/cart-count';
import { ThemeToggle } from '@/components/theme';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { getCategoryTreeSafe } from '@/lib/catalog-api';
import { CatalogSheet } from './catalog-sheet';
import { LocaleSwitcher } from './locale-switcher';
import { SearchForm } from './search-form';

const iconLink =
  'hidden h-11 flex-col items-center justify-center gap-0.5 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground md:flex [&_svg]:size-5';

export async function SiteHeader() {
  // Catalog data is live (cached briefly by the data cache), so pages render per request.
  await connection();
  const [t, locale, categories] = await Promise.all([
    getTranslations(),
    getLocale() as Promise<Locale>,
    getCategoryTreeSafe(),
  ]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 pt-3 pb-2 md:gap-6 md:py-3">
        <Link href="/" aria-label={t('common.brandHome')} className="shrink-0 rounded-md">
          <Logo className="text-[1.75rem]" />
        </Link>
        <SearchForm id="search-desktop" className="hidden md:flex" />
        <div className="ml-auto flex items-center gap-1">
          <LocaleSwitcher />
          <ThemeToggle />
          <Link href="/account" className={iconLink}>
            <UserRound aria-hidden="true" />
            {t('header.account')}
          </Link>
          <Link href="/cart" className={`relative ${iconLink}`}>
            <ShoppingCart aria-hidden="true" />
            <CartCount />
            {t('header.cart')}
          </Link>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 pb-2 md:hidden">
        <SearchForm id="search-mobile" />
      </div>
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 pb-2">
        <CatalogSheet categories={categories} />
        <nav aria-label={t('header.categoriesNav')} className="min-w-0 flex-1">
          <ul className="flex snap-x gap-1 overflow-x-auto [scrollbar-width:none]">
            {categories.map((category) => (
              <li key={category.slug} className="snap-start">
                <Link
                  href={`/c/${category.slug}`}
                  className="inline-flex h-9 items-center rounded-md px-3 text-sm whitespace-nowrap text-foreground/80 hover:bg-muted hover:text-foreground"
                >
                  {category.name[locale]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
