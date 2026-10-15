import { createHash, randomInt, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { orderResponseSchema } from '@uzgo/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, login, randomIp, TEST_ORIGIN } from './app.js';
import { createProduct, createStore, retireTestStores } from './fixtures.js';

const SECRET = 'click-secret-key-123';
const SERVICE = '9001';
type ClickAnswer = {
  error: number;
  merchant_prepare_id?: number;
  merchant_confirm_id?: number;
};

const md5 = (value: string) => createHash('md5').update(value).digest('hex');

describe('Click SHOP API', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let districtId = '';
  const http = () => request(app.getHttpServer());

  function signed(fields: Record<string, string>, secret = SECRET) {
    const parts = [
      fields.click_trans_id,
      fields.service_id,
      secret,
      fields.merchant_trans_id,
      ...(fields.action === '1' ? [fields.merchant_prepare_id] : []),
      fields.amount,
      fields.action,
      fields.sign_time,
    ];
    return { ...fields, sign_string: md5(parts.join('')) };
  }

  async function call(path: 'prepare' | 'complete', fields: Record<string, string>) {
    const res = await http()
      .post(`/api/v1/payments/click/${path}`)
      .set('X-Forwarded-For', randomIp())
      .type('form')
      .send(fields)
      .expect(200);
    return res.body as ClickAnswer;
  }

  const base = (number: string, amount = '3000.00') => ({
    click_trans_id: String(randomInt(1, 2 ** 47)),
    service_id: SERVICE,
    click_paydoc_id: String(randomInt(1, 2 ** 47)),
    merchant_trans_id: number,
    amount,
    action: '0',
    error: '0',
    error_note: 'Success',
    sign_time: '2026-10-15 12:00:00',
  });

  async function prepareOk(number: string) {
    const fields = base(number);
    const prepared = await call('prepare', signed(fields));
    expect(prepared.error).toBe(0);
    return { fields, prepareId: String(prepared.merchant_prepare_id) };
  }

  const completeFields = (fields: Record<string, string>, prepareId: string, error = '0') =>
    signed({ ...fields, action: '1', merchant_prepare_id: prepareId, error });

  async function clickOrder(method = 'CLICK') {
    const store = await createStore(prisma);
    const product = await createProduct(prisma, {
      storeId: store.id,
      variants: [{ priceTiyin: 1_500_00n, stock: 4 }],
    });
    const variantId = product.variants[0]?.id ?? '';
    await prisma.productVariant.update({
      where: { id: variantId },
      data: { mxikCode: '10202001001000000', packageCode: '1500567', vatRateBp: 1200 },
    });
    const customer = await login(app);
    await http()
      .post('/api/v1/cart/items')
      .set('Cookie', customer.cookie)
      .set('Origin', TEST_ORIGIN)
      .send({ variantId, quantity: 2 })
      .expect(201);
    const res = await http()
      .post('/api/v1/checkout')
      .set('Cookie', customer.cookie)
      .set('Origin', TEST_ORIGIN)
      .set('Idempotency-Key', randomUUID())
      .send({
        recipientName: 'Ali Valiyev',
        recipientPhone: '+998901234567',
        districtId,
        addressLine: 'Alpomish koʻchasi, 1',
        paymentMethod: method,
        expectedTotalTiyin: '300000',
      })
      .expect(201);
    return { order: orderResponseSchema.parse(res.body).order, variantId, customer };
  }

  beforeAll(async () => {
    app = await createTestApp({
      env: {
        CLICK_SERVICE_ID: SERVICE,
        CLICK_MERCHANT_ID: '9002',
        CLICK_MERCHANT_USER_ID: '9003',
        CLICK_SECRET_KEY: SECRET,
      },
    });
    prisma = app.get(PrismaService);
    districtId = (await prisma.district.findUniqueOrThrow({ where: { slug: 'termiz_city' } })).id;
  });

  afterAll(async () => {
    await retireTestStores(prisma);
    await app.close();
  });

  it('rejects bad signatures, wrong service, wrong action and malformed requests', async () => {
    const { order } = await clickOrder();
    const fields = base(order.number);
    expect((await call('prepare', signed(fields, 'wrong-secret'))).error).toBe(-1);
    expect((await call('prepare', { ...signed(fields), amount: '1.00' })).error).toBe(-1);
    expect((await call('prepare', signed({ ...fields, service_id: '1' }))).error).toBe(-8);
    expect(
      (await call('prepare', signed({ ...fields, action: '1', merchant_prepare_id: '1' }))).error,
    ).toBe(-3);
    expect((await call('prepare', {})).error).toBe(-8);
  });

  it('checks the order and the exact amount in soʻm', async () => {
    const { order } = await clickOrder();
    expect((await call('prepare', signed(base('UZ-2026-999999')))).error).toBe(-5);
    expect((await call('prepare', signed(base(order.number, '2999.99')))).error).toBe(-2);
    expect((await call('prepare', signed(base(order.number, '3000.001')))).error).toBe(-2);
    // 3000 and 3000.0 are the same amount as 3000.00.
    expect((await call('prepare', signed(base(order.number, '3000')))).error).toBe(0);
    const cod = await clickOrder('CASH_ON_DELIVERY');
    expect((await call('prepare', signed(base(cod.order.number)))).error).toBe(-5);
  });

  it('prepare → complete captures the order once; repeats are idempotent', async () => {
    const { order } = await clickOrder();
    const { fields, prepareId } = await prepareOk(order.number);
    // Repeating Prepare for the same Click transaction returns the same id.
    expect((await call('prepare', signed(fields))).merchant_prepare_id).toBe(Number(prepareId));

    const done = await call('complete', completeFields(fields, prepareId));
    expect(done.error).toBe(0);
    expect(done.merchant_confirm_id).toBe(Number(prepareId));
    const again = await call('complete', completeFields(fields, prepareId));
    expect(again).toMatchObject({ error: 0, merchant_confirm_id: Number(prepareId) });

    const row = await prisma.order.findUniqueOrThrow({ where: { number: order.number } });
    expect(row.paidAt).not.toBeNull();
    expect(row.status).toBe('CREATED');
    expect(await prisma.paymentAttempt.count({ where: { orderId: row.id, status: 'PAID' } })).toBe(
      1,
    );

    // Another Click transaction for a paid order is refused.
    expect((await call('prepare', signed(base(order.number)))).error).toBe(-4);
  });

  it('complete with a wrong prepare id, amount or transaction is refused', async () => {
    const { order } = await clickOrder();
    const { fields, prepareId } = await prepareOk(order.number);
    expect((await call('complete', completeFields(fields, '999999999'))).error).toBe(-6);
    expect(
      (await call('complete', completeFields({ ...fields, click_trans_id: '1' }, prepareId))).error,
    ).toBe(-6);
    expect(
      (await call('complete', completeFields({ ...fields, amount: '2000.00' }, prepareId))).error,
    ).toBe(-2);
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { number: order.number } })).paidAt,
    ).toBeNull();
  });

  it('a failed charge reported by Click cancels the attempt; the order stays payable', async () => {
    const { order } = await clickOrder();
    const { fields, prepareId } = await prepareOk(order.number);
    expect((await call('complete', completeFields(fields, prepareId, '-5017'))).error).toBe(-9);
    expect((await call('complete', completeFields(fields, prepareId))).error).toBe(-9);
    const row = await prisma.order.findUniqueOrThrow({ where: { number: order.number } });
    expect(row.status).toBe('AWAITING_PAYMENT');

    const retry = await prepareOk(order.number);
    expect((await call('complete', completeFields(retry.fields, retry.prepareId))).error).toBe(0);
  });

  it('refuses money for an order cancelled between prepare and complete', async () => {
    const { order, variantId, customer } = await clickOrder();
    const { fields, prepareId } = await prepareOk(order.number);
    await http()
      .post(`/api/v1/orders/${order.number}/cancel`)
      .set('Cookie', customer.cookie)
      .set('Origin', TEST_ORIGIN)
      .expect(200);
    expect((await call('complete', completeFields(fields, prepareId))).error).toBe(-9);
    const attempt = await prisma.paymentAttempt.findFirstOrThrow({
      where: { providerTxId: fields.click_trans_id },
    });
    expect(attempt.status).toBe('CANCELLED');
    expect(
      (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock,
    ).toBe(4);
  });

  it('accepts a complete that arrives after the window while its prepare was open', async () => {
    const { order } = await clickOrder();
    const { fields, prepareId } = await prepareOk(order.number);
    await prisma.order.update({
      where: { number: order.number },
      data: { paymentDueAt: new Date(Date.now() - 1000) },
    });
    // The stock was still held for this transaction (expiry waits for open attempts).
    expect((await call('complete', completeFields(fields, prepareId))).error).toBe(0);
  });
});
