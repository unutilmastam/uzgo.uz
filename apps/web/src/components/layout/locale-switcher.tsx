'use client';

import { cn } from '@uzgo/ui/lib/cn';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

function LocaleLinks({ query }: { query: Record<string, string> }) {
  const t = useTranslations();
  const current = useLocale();
  const pathname = usePathname();

  return (
    <nav aria-label={t('header.language')} className="flex items-center rounded-md bg-muted p-0.5">
      {routing.locales.map((locale) => (
        <Link
          key={locale}
          href={{ pathname, query }}
          locale={locale}
          hrefLang={locale}
          aria-current={locale === current ? 'true' : undefined}
          className={cn(
            'inline-flex h-8 min-w-10 items-center justify-center rounded-sm px-2 text-xs font-bold',
            locale === current
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <span aria-hidden="true">{t(`locales.${locale}Short`)}</span>
          <span className="sr-only" lang={locale}>
            {t(`locales.${locale}`)}
          </span>
        </Link>
      ))}
    </nav>
  );
}

function LocaleLinksWithQuery() {
  const searchParams = useSearchParams();
  return <LocaleLinks query={Object.fromEntries(searchParams.entries())} />;
}

/**
 * Switches language and keeps the current page and query string. Static pages
 * render the fallback (path only) first; the query is added on the client.
 */
export function LocaleSwitcher() {
  return (
    <Suspense fallback={<LocaleLinks query={{}} />}>
      <LocaleLinksWithQuery />
    </Suspense>
  );
}
