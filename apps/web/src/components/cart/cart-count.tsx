'use client';

import { cartResponseSchema } from '@uzgo/contracts';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { onCartChanged } from '@/lib/cart-events';

/** Small count bubble for cart links; loads once and follows cart changes. */
export function CartCount() {
  const t = useTranslations('cart');
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    apiClient('/cart')
      .then((json) => {
        if (active) setCount(cartResponseSchema.parse(json).cart.itemCount);
      })
      .catch(() => {
        // The badge is decorative; the cart page shows real errors.
      });
    const off = onCartChanged((cart) => {
      setCount(cart.itemCount);
    });
    return () => {
      active = false;
      off();
    };
  }, []);

  if (count === 0) return null;
  return (
    <span
      data-testid="cart-count"
      className="absolute -top-1 right-0 min-w-5 rounded-full bg-accent px-1 text-center text-[0.6875rem] leading-5 font-bold text-accent-foreground"
    >
      <span aria-hidden="true">{count > 99 ? '99+' : count}</span>
      <span className="sr-only">{t('badge', { count })}</span>
    </span>
  );
}
