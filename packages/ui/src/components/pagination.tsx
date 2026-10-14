import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ComponentProps, ElementType } from 'react';
import { cn } from '../lib/cn';
import { buttonVariants } from './button';

/** Page numbers to show: always first and last, a window around the current page, gaps as null. */
export function paginationRange(page: number, pageCount: number, siblings = 1): (number | null)[] {
  if (pageCount <= 0) return [];
  const current = Math.min(Math.max(page, 1), pageCount);
  const start = Math.max(2, current - siblings);
  const end = Math.min(pageCount - 1, current + siblings);
  const range: (number | null)[] = [1];
  if (start > 2) range.push(null);
  for (let p = start; p <= end; p++) range.push(p);
  if (end < pageCount - 1) range.push(null);
  if (pageCount > 1) range.push(pageCount);
  return range;
}

export type PaginationLabels = {
  nav: string;
  previous: string;
  next: string;
  page: (page: number) => string;
};

export type PaginationProps = Omit<ComponentProps<'nav'>, 'children'> & {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
  labels: PaginationLabels;
  /** Link component, e.g. the i18n-aware Next.js Link. Defaults to <a>. */
  linkAs?: ElementType;
};

export function Pagination({
  page,
  pageCount,
  hrefFor,
  labels,
  linkAs: Link = 'a',
  className,
  ...props
}: PaginationProps) {
  if (pageCount <= 1) return null;
  const item = (active: boolean) =>
    cn(buttonVariants({ variant: active ? 'primary' : 'ghost', size: 'icon-sm' }), 'tabular-nums');

  return (
    <nav aria-label={labels.nav} className={cn('flex justify-center', className)} {...props}>
      <ul className="flex items-center gap-1">
        <li>
          {page > 1 ? (
            <Link href={hrefFor(page - 1)} aria-label={labels.previous} className={item(false)}>
              <ChevronLeft aria-hidden="true" />
            </Link>
          ) : null}
        </li>
        {paginationRange(page, pageCount).map((p, index) =>
          p === null ? (
            <li
              key={`gap-${String(index)}`}
              aria-hidden="true"
              className="px-1 text-muted-foreground"
            >
              …
            </li>
          ) : (
            <li key={p}>
              <Link
                href={hrefFor(p)}
                aria-label={labels.page(p)}
                aria-current={p === page ? 'page' : undefined}
                className={item(p === page)}
              >
                {p}
              </Link>
            </li>
          ),
        )}
        <li>
          {page < pageCount ? (
            <Link href={hrefFor(page + 1)} aria-label={labels.next} className={item(false)}>
              <ChevronRight aria-hidden="true" />
            </Link>
          ) : null}
        </li>
      </ul>
    </nav>
  );
}
