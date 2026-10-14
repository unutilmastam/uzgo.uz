import type { ElementType, ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Badge } from './badge';

export type ServiceCardProps = {
  /** Illustration (decorative). */
  icon: ReactNode;
  title: string;
  description?: string;
  /** e.g. "Tez kunda" / "Скоро". */
  statusLabel?: string;
  /** Only live services get a link. Coming-soon services are never interactive (SPEC §2). */
  href?: string;
  linkAs?: ElementType;
  /** Background tint of the illustration tile, e.g. "bg-sky-50". */
  tint?: string;
  className?: string;
};

export function ServiceCard({
  icon,
  title,
  description,
  statusLabel,
  href,
  linkAs: Link = 'a',
  tint = 'bg-secondary',
  className,
}: ServiceCardProps) {
  const content = (
    <>
      <div
        aria-hidden="true"
        className={cn(
          'relative flex aspect-square w-full items-center justify-center rounded-xl p-2 transition-transform duration-(--duration-base) motion-reduce:transition-none sm:aspect-[16/9] [&_svg]:h-4/5 [&_svg]:w-auto',
          tint,
          href ? 'group-hover:scale-[1.03]' : 'opacity-90 grayscale-[35%]',
        )}
      >
        {icon}
      </div>
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-sm leading-tight font-semibold">{title}</span>
        {description ? (
          <span className="hidden text-xs text-muted-foreground sm:block">{description}</span>
        ) : null}
        {statusLabel ? (
          <Badge variant={href ? 'accent' : 'muted'} className="text-[0.6875rem]">
            {statusLabel}
          </Badge>
        ) : null}
      </div>
    </>
  );

  const base = cn('group flex h-full flex-col items-center gap-2 rounded-xl p-1.5', className);

  return href ? (
    <Link href={href} className={cn(base, 'hover:bg-muted')}>
      {content}
    </Link>
  ) : (
    <div aria-disabled="true" className={base}>
      {content}
    </div>
  );
}
