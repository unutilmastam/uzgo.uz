'use client';

import type { ComponentProps } from 'react';
import { Toaster as Sonner, toast } from 'sonner';

export { toast };

/** Mount once in the root layout. Toasts are announced politely to screen readers. */
export function Toaster(props: ComponentProps<typeof Sonner>) {
  return (
    <Sonner
      position="top-center"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            '!rounded-lg !border !border-border !bg-popover !text-popover-foreground !shadow-lg !font-sans',
          description: '!text-muted-foreground',
        },
      }}
      {...props}
    />
  );
}
