'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import { Dialog as SheetPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/** Side or bottom panel built on the accessible dialog primitive. */
export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;
export const SheetTitle = SheetPrimitive.Title;
export const SheetDescription = SheetPrimitive.Description;

const sheetVariants = cva(
  'fixed z-50 flex flex-col gap-4 bg-popover text-popover-foreground shadow-xl outline-none',
  {
    variants: {
      side: {
        left: 'inset-y-0 left-0 h-full w-[85%] max-w-sm border-r border-border data-[state=open]:animate-slide-in-left',
        bottom:
          'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-xl border-t border-border pb-[env(safe-area-inset-bottom)] data-[state=open]:animate-slide-in-bottom',
      },
    },
    defaultVariants: { side: 'left' },
  },
);

export type SheetContentProps = ComponentProps<typeof SheetPrimitive.Content> &
  VariantProps<typeof sheetVariants> & {
    /** Accessible label of the close button (translated by the caller). */
    closeLabel: string;
  };

export function SheetContent({
  className,
  children,
  side,
  closeLabel,
  ...props
}: SheetContentProps) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
      <SheetPrimitive.Content className={cn(sheetVariants({ side }), className)} {...props}>
        {children}
        <SheetPrimitive.Close
          aria-label={closeLabel}
          className="absolute top-3 right-3 inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X aria-hidden="true" className="size-5" />
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export function SheetHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-col gap-1 border-b border-border p-4 pr-14', className)}
      {...props}
    />
  );
}
