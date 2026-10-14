import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';

export function SectionHeader({
  id,
  title,
  extra,
  viewAll,
}: {
  id: string;
  title: string;
  extra?: ReactNode;
  viewAll?: { href: string; label: string };
}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <h2 id={id} className="text-xl font-bold md:text-2xl">
        {title}
      </h2>
      {extra}
      {viewAll ? (
        <Link
          href={viewAll.href}
          className="ml-auto inline-flex min-h-9 items-center gap-0.5 rounded-md px-2 text-sm font-semibold text-primary hover:bg-secondary"
        >
          {viewAll.label}
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      ) : null}
    </div>
  );
}
