import type { Env } from '../config/env.js';
import type { PaymentMethod } from '../generated/prisma/enums.js';

export const ONLINE_METHODS: ReadonlySet<PaymentMethod> = new Set(['PAYME', 'CLICK', 'DEV_ONLINE']);

/** Methods that need IKPU/package codes on every item (fiscal receipts via the provider). */
export const FISCAL_METHODS: ReadonlySet<PaymentMethod> = new Set(['PAYME', 'CLICK']);

export const paymeConfigured = (env: Env): boolean =>
  Boolean(env.PAYME_MERCHANT_ID && env.PAYME_KEY);

export const clickConfigured = (env: Env): boolean =>
  Boolean(
    env.CLICK_SERVICE_ID &&
    env.CLICK_MERCHANT_ID &&
    env.CLICK_MERCHANT_USER_ID &&
    env.CLICK_SECRET_KEY,
  );

/**
 * What checkout may offer now. A real provider appears only when its
 * credentials are configured; the simulated one only outside production.
 */
export function enabledPaymentMethods(env: Env): PaymentMethod[] {
  return [
    'CASH_ON_DELIVERY',
    ...(paymeConfigured(env) ? (['PAYME'] as const) : []),
    ...(clickConfigured(env) ? (['CLICK'] as const) : []),
    ...(env.DEV_PAYMENTS_ENABLED && env.NODE_ENV !== 'production' ? (['DEV_ONLINE'] as const) : []),
  ];
}
