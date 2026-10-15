import { describe, expect, it } from 'vitest';
import { parseEnv } from '../config/env.js';
import { paymentLink, somStringToTiyin, tiyinToSomString } from './payment-links.js';

const env = parseEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/uzgo',
  CORS_ORIGINS: 'https://uzgo.uz',
  AUTH_SECRET: 'x'.repeat(40),
  SMS_PROVIDER: 'fake',
  TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  PAYME_MERCHANT_ID: '5e730e8e0b852a417aa49ceb',
  PAYME_KEY: 'test-key-123',
  CLICK_SERVICE_ID: '111',
  CLICK_MERCHANT_ID: '222',
  CLICK_MERCHANT_USER_ID: '333',
  CLICK_SECRET_KEY: 'secret-key',
});
const order = { number: 'UZ-2026-000123', totalTiyin: 1_250_050n };

describe('payment amounts and links', () => {
  it('converts between tiyin and Click soʻm strings without floats', () => {
    expect(tiyinToSomString(1_250_050n)).toBe('12500.50');
    expect(tiyinToSomString(500n)).toBe('5.00');
    expect(somStringToTiyin('12500.50')).toBe(1_250_050n);
    expect(somStringToTiyin('12500.5')).toBe(1_250_050n);
    expect(somStringToTiyin('5000')).toBe(500_000n);
    for (const bad of ['', '-5', '1e5', '12.345', 'abc', '1,5']) {
      expect(somStringToTiyin(bad)).toBeNull();
    }
  });

  it('builds the Payme checkout link with the amount in tiyin', () => {
    const url = paymentLink(env, 'PAYME', order, 'uz') ?? '';
    expect(url.startsWith('https://checkout.paycom.uz/')).toBe(true);
    const decoded = Buffer.from(url.split('/').pop() ?? '', 'base64').toString();
    expect(decoded).toBe(
      'm=5e730e8e0b852a417aa49ceb;ac.order_id=UZ-2026-000123;a=1250050;l=uz;c=https://uzgo.uz/uz/orders/UZ-2026-000123',
    );
  });

  it('builds the Click link with the amount in soʻm', () => {
    const url = new URL(paymentLink(env, 'CLICK', order, 'ru') ?? '');
    expect(url.origin + url.pathname).toBe('https://my.click.uz/services/pay');
    expect(url.searchParams.get('amount')).toBe('12500.50');
    expect(url.searchParams.get('transaction_param')).toBe('UZ-2026-000123');
    expect(url.searchParams.get('return_url')).toBe('https://uzgo.uz/ru/orders/UZ-2026-000123');
  });

  it('has no link for cash on delivery', () => {
    expect(paymentLink(env, 'CASH_ON_DELIVERY', order, 'uz')).toBeNull();
  });
});
