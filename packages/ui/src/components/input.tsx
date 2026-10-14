import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base text-foreground placeholder:text-muted-foreground transition-colors duration-(--duration-fast) focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm',
        className,
      )}
      {...props}
    />
  );
}
