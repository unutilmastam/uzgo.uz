import type { CartView } from '@uzgo/contracts';

const EVENT = 'uzgo:cart';

/** Tells every cart badge on the page that the cart changed. */
export function emitCartChanged(cart: CartView): void {
  window.dispatchEvent(new CustomEvent<CartView>(EVENT, { detail: cart }));
}

export function onCartChanged(listener: (cart: CartView) => void): () => void {
  const handler = (event: Event) => {
    listener((event as CustomEvent<CartView>).detail);
  };
  window.addEventListener(EVENT, handler);
  return () => {
    window.removeEventListener(EVENT, handler);
  };
}
