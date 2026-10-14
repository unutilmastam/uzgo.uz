import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Badge } from './badge';

export type ServiceCardProps = {
  icon: ReactNode;
  title: string;
  description: string;
  /** e.g. "Tez kunda" / "Скоро". Coming-soon services are never interactive. */
  statusLabel: string;
  className?: string;
};

/** A future UZGO service. Intentionally not a link or button (SPEC §2). */
export function ServiceCard({
  icon,
  title,
  description,
  statusLabel,
  className,
}: ServiceCardProps) {
  return (
    <div
      aria-disabled="true"
      className={cn(
        'flex h-full flex-col gap-3 rounded-lg border border-dashed border-border bg-card p-4 text-card-foreground',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          aria-hidden="true"
          className="flex size-11 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-6"
        >
          {icon}
        </div>
        <Badge variant="muted">{statusLabel}</Badge>
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
