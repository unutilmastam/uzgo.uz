'use client';

import { cn } from '@uzgo/ui/lib/cn';
import { Link, usePathname } from '@/i18n/navigation';

/** Section tabs of a panel; the current one is marked for assistive tech. */
export function PanelTabs({
  label,
  items,
}: {
  label: string;
  /** `exact`: current only on `href` itself or under one of `also`. */
  items: { href: string; label: string; exact?: boolean; also?: string[] }[];
}) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-1 border-b border-border">
        {items.map((item) => {
          const current = item.exact
            ? pathname === item.href || (item.also ?? []).some((p) => pathname.startsWith(p))
            : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  '-mb-px inline-flex h-11 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap',
                  current
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
