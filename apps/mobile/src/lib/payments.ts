import { ONLINE_PAYMENT_METHODS, type PaymentMethod } from '@uzgo/contracts';
import * as WebBrowser from 'expo-web-browser';
import { z } from 'zod';
import type { ApiClient } from './api';
import type { Locale } from './i18n';

/** GET /orders/:number/payment-link — the provider's checkout page. */
const paymentLinkSchema = z.object({ url: z.url({ protocol: /^https?$/ }) });

export const isOnlineMethod = (method: PaymentMethod) =>
  (ONLINE_PAYMENT_METHODS as readonly string[]).includes(method);

/**
 * Opens the Payme/Click page in the system browser (card data never touches
 * the app). The simulated DEV provider is paid through the API directly.
 * Resolves when the browser is closed; the caller then reloads the order.
 */
export async function payOrder(
  api: ApiClient,
  number: string,
  method: PaymentMethod,
  locale: Locale,
): Promise<void> {
  if (method === 'DEV_ONLINE') {
    await api.request(`/payments/dev/${encodeURIComponent(number)}`, {
      method: 'POST',
      body: { outcome: 'success' },
    });
    return;
  }
  const { url } = await api.request(
    `/orders/${encodeURIComponent(number)}/payment-link?locale=${locale}`,
    { schema: paymentLinkSchema },
  );
  await WebBrowser.openBrowserAsync(url);
}
