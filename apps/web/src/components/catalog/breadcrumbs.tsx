import { ChevronRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export async function Breadcrumbs({ items }: { items: { href?: string; label: string }[] }) {
  const t = await getTranslations();
  const all = [{ href: '/', label: t('common.home') }, ...items];
  return (
    <nav
      aria-label={t('catalog.breadcrumbs')}
      className="mb-3 overflow-x-auto [scrollbar-width:none]"
    >
      <ol className="flex items-center gap-1 text-sm whitespace-nowrap text-muted-foreground">
        {all.map((item, index) => (
          <li key={`${item.label}-${String(index)}`} className="flex items-center gap-1">
            {index > 0 ? <ChevronRight aria-hidden="true" className="size-3.5" /> : null}
            {item.href && index < all.length - 1 ? (
              <Link href={item.href} className="hover:text-foreground hover:underline">
                {item.label}
              </Link>
            ) : (
              <span
                aria-current={index === all.length - 1 ? 'page' : undefined}
                className="text-foreground"
              >
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
