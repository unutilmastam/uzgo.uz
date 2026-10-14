'use client';

import { cn } from '@uzgo/ui/lib/cn';
import { House, LayoutGrid, ShoppingCart, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CartCount } from '@/components/cart/cart-count';
import { Link, usePathname } from '@/i18n/navigation';

const ITEMS = [
  { href: '/', icon: House, label: 'common.home' },
  { href: '/catalog', icon: LayoutGrid, label: 'header.catalog' },
  { href: '/cart', icon: ShoppingCart, label: 'header.cart' },
  { href: '/account', icon: UserRound, label: 'header.account' },
] as const;

/** Thumb-reachable navigation for phones; hidden from md up. */
export function MobileBottomNav() {
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <nav
      aria-label={t('header.bottomNav')}
      data-testid="bottom-nav"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-4">
        {ITEMS.map(({ href, icon: Icon, label }) => {
          const active =
            href === '/'
              ? pathname === '/'
              : href === '/catalog'
                ? /^\/(catalog|c|p|s|search)(\/|$)/.test(pathname)
                : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="relative">
                  <Icon aria-hidden="true" className="size-6" />
                  {href === '/cart' ? <CartCount /> : null}
                </span>
                {t(label)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
