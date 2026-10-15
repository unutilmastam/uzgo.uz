import { cn } from '@uzgo/ui/lib/cn';
import type { ComponentProps, ReactNode } from 'react';

/** Label + control + optional hint, wired for screen readers by the caller's ids. */
export function Field({
  id,
  label,
  hint,
  className,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const control =
  'w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring/40 disabled:cursor-not-allowed disabled:opacity-50';

/** Native select: reliable on phones and with long dynamic lists. */
export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(control, 'h-11', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(control, 'min-h-28 py-2', className)} {...props} />;
}

export function FormError({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-sm font-medium text-destructive">
      {message}
    </p>
  );
}
