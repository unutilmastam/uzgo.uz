'use client';

import { Button } from '@uzgo/ui/components/button';
import { toast } from '@uzgo/ui/components/toast';
import { ShoppingCart } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** Demo only: the real cart arrives in Phase 4. Never pretends to add the item. */
export function AddToCartButton({ title }: { title: string }) {
  const t = useTranslations('product');
  return (
    <Button
      variant="secondary"
      size="sm"
      className="w-full"
      aria-label={t('addToCartLabel', { title })}
      onClick={() => {
        toast(t('cartSoon'));
      }}
    >
      <ShoppingCart aria-hidden="true" className="size-4" />
      {t('addToCart')}
    </Button>
  );
}
