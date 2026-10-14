import { Logo } from '@uzgo/ui/components/logo';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { InfoPage } from '@/lib/info-pages';

const COLUMNS: { title: 'customers' | 'sellers' | 'company'; pages: InfoPage[] }[] = [
  { title: 'customers', pages: ['help', 'terms', 'privacy'] },
  { title: 'sellers', pages: ['sell'] },
  { title: 'company', pages: ['about', 'contacts'] },
];

export async function SiteFooter() {
  const t = await getTranslations();

  return (
    <footer className="mt-16 border-t border-border bg-muted/50">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-3">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">{t('footer.tagline')}</p>
        </div>
        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={t(`footer.${column.title}`)}>
            <h2 className="mb-3 text-sm font-semibold">{t(`footer.${column.title}`)}</h2>
            <ul className="flex flex-col gap-1">
              {column.pages.map((page) => (
                <li key={page}>
                  <Link
                    href={`/info/${page}`}
                    className="inline-flex min-h-9 items-center text-sm text-muted-foreground hover:text-foreground"
                  >
                    {t(`info.${page}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-7xl px-4 py-4 text-xs text-muted-foreground">
          {t('footer.copyright', { year: new Date().getFullYear() })}
        </p>
      </div>
    </footer>
  );
}
