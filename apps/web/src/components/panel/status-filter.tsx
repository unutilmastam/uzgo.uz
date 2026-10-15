import { cn } from '@uzgo/ui/lib/cn';
import { Link } from '@/i18n/navigation';

/** Chip links that filter a list by status (state lives in the URL). */
export function StatusFilter({
  label,
  current,
  options,
}: {
  label: string;
  current: string | undefined;
  options: { value: string | undefined; label: string; href: string }[];
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1">
      {options.map((option) => (
        <Link
          key={option.value ?? 'all'}
          href={option.href}
          aria-current={option.value === current ? 'page' : undefined}
          className={cn(
            'rounded-full px-3 py-1.5 text-sm',
            option.value === current
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted hover:bg-secondary',
          )}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}
