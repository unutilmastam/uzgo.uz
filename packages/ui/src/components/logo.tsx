import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/**
 * Text wordmark (docs/DESIGN_SYSTEM.md): "UZ" in brand blue, "GO" in brand
 * green. A designed logo can replace this component without other changes.
 */
export function Logo({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      role="img"
      aria-label="UZGO"
      className={cn(
        'inline-flex items-baseline text-2xl leading-none font-extrabold tracking-[-0.04em] select-none',
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className="text-primary">
        UZ
      </span>
      <span aria-hidden="true" className="text-brand-go">
        GO
      </span>
    </span>
  );
}
