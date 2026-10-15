import { cn } from '@uzgo/ui/lib/cn';
import { Star } from 'lucide-react';

/** Read-only star row; `label` is the accessible text ("4.5 out of 5"). */
export function Stars({
  value,
  label,
  className,
}: {
  value: number;
  label: string;
  className?: string;
}) {
  const filled = Math.round(value);
  return (
    <span role="img" aria-label={label} className={cn('inline-flex gap-0.5', className)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden="true"
          className={cn(
            'size-[1em]',
            n <= filled ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40',
          )}
        />
      ))}
    </span>
  );
}
