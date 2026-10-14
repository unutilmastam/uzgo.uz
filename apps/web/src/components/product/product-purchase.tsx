'use client';

import { type CartView, cartResponseSchema, type Variant } from '@uzgo/contracts';
import { Button } from '@uzgo/ui/components/button';
import { toast } from '@uzgo/ui/components/toast';
import { ShoppingCart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { QuantityStepper } from '@/components/cart/quantity-stepper';
import { useRouter } from '@/i18n/navigation';
import { ApiClientError, apiClient } from '@/lib/api-client';
import { emitCartChanged } from '@/lib/cart-events';
import { VariantPicker } from './variant-picker';

const CART_ERRORS = new Set(['INSUFFICIENT_STOCK', 'PRODUCT_UNAVAILABLE', 'CART_LIMIT']);

function AddToCart({ variant }: { variant: Variant }) {
  const t = useTranslations();
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [pending, setPending] = useState(false);
  const max = Math.max(1, Math.min(variant.available, 10));
  const qty = Math.min(quantity, max);

  async function add() {
    setPending(true);
    try {
      const json = await apiClient('/cart/items', {
        method: 'POST',
        body: { variantId: variant.id, quantity: qty },
      });
      const cart: CartView = cartResponseSchema.parse(json).cart;
      emitCartChanged(cart);
      toast.success(t('cart.added'), {
        action: {
          label: t('cart.goToCart'),
          onClick: () => {
            router.push('/cart');
          },
        },
      });
    } catch (err) {
      const code = err instanceof ApiClientError ? err.code : '';
      toast.error(CART_ERRORS.has(code) ? t(`cart.error_${code}`) : t('auth.error_generic'));
    } finally {
      setPending(false);
    }
  }

  if (variant.available === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <QuantityStepper
        value={qty}
        max={max}
        onChange={setQuantity}
        label={t('product.quantity')}
        disabled={pending}
      />
      <Button
        size="lg"
        variant="accent"
        className="flex-1"
        disabled={pending}
        onClick={() => void add()}
      >
        <ShoppingCart aria-hidden="true" />
        {t('product.addToCart')}
      </Button>
    </div>
  );
}

/** Variant selection + add to cart. */
export function ProductPurchase({ variants }: { variants: Variant[] }) {
  return (
    <VariantPicker variants={variants}>
      {(variant) => <AddToCart key={variant.id} variant={variant} />}
    </VariantPicker>
  );
}
