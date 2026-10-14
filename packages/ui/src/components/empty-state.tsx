import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn';

export type EmptyStateProps = Omit<ComponentProps<'div'>, 'title'> & {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Optional call to action, e.g. a Button. */
  action?: ReactNode;
  /** "error" announces the state to screen readers immediately. */
  tone?: 'neutral' | 'error';
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = 'neutral',
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-12 text-center',
        className,
      )}
      {...props}
    >
      {icon ? (
        <div
          aria-hidden="true"
          className={cn(
            'flex size-16 items-center justify-center rounded-full [&_svg]:size-8',
            tone === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-primary',
          )}
        >
          {icon}
        </div>
      ) : null}
      <h2 className="text-lg font-semibold">{title}</h2>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
