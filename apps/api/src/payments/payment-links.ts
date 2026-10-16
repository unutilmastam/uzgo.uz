import type { Env } from '../config/env.js';
import type { PaymentMethod } from '../generated/prisma/enums.js';

/** Tiyin → Click's soʻm string with two decimals, using integer arithmetic only. */
export function tiyinToSomString(tiyin: bigint): string {
  const sign = tiyin < 0n ? '-' : '';
  const abs = tiyin < 0n ? -tiyin : tiyin;
  return `${sign}${(abs / 100n).toString()}.${(abs % 100n).toString().padStart(2, '0')}`;
}

/** Click's soʻm amount ("5000.00", "5000", "5000.5") → tiyin, or null if malformed. */
export function somStringToTiyin(value: string): bigint | null {
  const match = /^(\d{1,13})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  return BigInt(match[1] ?? '0') * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
}

/**
 * Where the customer pays. Payme and Click host the payment page; the dev
 * method opens a local simulated page. Parameter names follow the providers'
 * checkout documentation (ADR 0017 — verify against the merchant contract).
 */
export function paymentLink(
  env: Env,
  method: PaymentMethod,
  order: { number: string; totalTiyin: bigint; kind?: string },
  locale: 'uz' | 'ru',
): string | null {
  // Rides come back to their live ride page (ADR 0025).
  const page = order.kind === 'RIDE' ? 'go' : 'orders';
  const returnUrl = `${env.WEB_PUBLIC_URL}/${locale}/${page}/${order.number}`;
  switch (method) {
    case 'PAYME': {
      if (!env.PAYME_MERCHANT_ID) return null;
      const params = [
        `m=${env.PAYME_MERCHANT_ID}`,
        `ac.order_id=${order.number}`,
        `a=${order.totalTiyin.toString()}`,
        `l=${locale}`,
        `c=${returnUrl}`,
      ].join(';');
      return `${env.PAYME_CHECKOUT_URL}/${Buffer.from(params).toString('base64')}`;
    }
    case 'CLICK': {
      if (!env.CLICK_SERVICE_ID || !env.CLICK_MERCHANT_ID) return null;
      const query = new URLSearchParams({
        service_id: env.CLICK_SERVICE_ID,
        merchant_id: env.CLICK_MERCHANT_ID,
        amount: tiyinToSomString(order.totalTiyin),
        transaction_param: order.number,
        return_url: returnUrl,
      });
      return `${env.CLICK_PAY_URL}?${query.toString()}`;
    }
    case 'DEV_ONLINE':
      return `${env.WEB_PUBLIC_URL}/${locale}/pay/dev/${order.number}`;
    default:
      return null;
  }
}
