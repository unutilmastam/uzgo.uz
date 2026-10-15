import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { apiErrorSchema, orderResponseSchema } from '@uzgo/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, login, randomIp, TEST_ORIGIN } from './app.js';
import { createProduct, createStore, retireTestStores } from './fixtures.js';

const KEY = 'payme-test-key-0123456789';
const AUTH = `Basic ${Buffer.from(`Paycom:${KEY}`).toString('base64')}`;
type Rpc = {
  result?: Record<string, unknown> & { state?: number; transaction?: string };
  error?: { code: number; data?: string };
};

describe('Payme Merchant API', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let districtId = '';
  let rpcId = 0;
  const http = () => request(app.getHttpServer());

  /** A Payme server call (no cookies, no Origin — like the real provider). */
  async function rpc(method: string, params: object, auth: string | null = AUTH): Promise<Rpc> {
    rpcId += 1;
    let req = http().post('/api/v1/payments/payme').set('X-Forwarded-For', randomIp());
    if (auth) req = req.set('Authorization', auth);
    const res = await req.send({ id: rpcId, method, params }).expect(200);
    return res.body as Rpc;
  }

  async function paymeOrder(options: { fiscal?: boolean; method?: string } = {}) {
    const store = await createStore(prisma);
    await prisma.store.update({ where: { id: store.id }, data: { taxId: '301234567' } });
    const product = await createProduct(prisma, {
      storeId: store.id,
      variants: [{ priceTiyin: 1_500_00n, stock: 4 }],
    });
    const variantId = product.variants[0]?.id ?? '';
    if (options.fiscal !== false) {
      await prisma.productVariant.update({
        where: { id: variantId },
        data: { mxikCode: '10202001001000000', packageCode: '1500567', vatRateBp: 1200 },
      });
    }
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
        paymentMethod: options.method ?? 'PAYME',
        expectedTotalTiyin: '300000',
      });
    return { res, customer, variantId };
  }

  async function placed(options: { method?: string } = {}) {
    const { res, customer, variantId } = await paymeOrder(options);
    expect(res.status).toBe(201);
    return { order: orderResponseSchema.parse(res.body).order, customer, variantId };
  }

  const stockOf = async (variantId: string) =>
    (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock;
  const orderRow = (number: string) => prisma.order.findUniqueOrThrow({ where: { number } });

  beforeAll(async () => {
    app = await createTestApp({ env: { PAYME_MERCHANT_ID: 'test-merchant-id', PAYME_KEY: KEY } });
    prisma = app.get(PrismaService);
    districtId = (await prisma.district.findUniqueOrThrow({ where: { slug: 'termiz_city' } })).id;
  });

  afterAll(async () => {
    await retireTestStores(prisma);
    await app.close();
  });

  it('rejects calls without the merchant key (always HTTP 200, JSON-RPC error)', async () => {
    expect((await rpc('CheckTransaction', { id: 'x' }, null)).error?.code).toBe(-32504);
    const wrong = `Basic ${Buffer.from('Paycom:wrong-key').toString('base64')}`;
    expect((await rpc('CheckTransaction', { id: 'x' }, wrong)).error?.code).toBe(-32504);
    const otherLogin = `Basic ${Buffer.from(`Other:${KEY}`).toString('base64')}`;
    expect((await rpc('CheckTransaction', { id: 'x' }, otherLogin)).error?.code).toBe(-32504);
    expect((await rpc('NoSuchMethod', {})).error?.code).toBe(-32601);
  });

  it('requires fiscal data for every item before an order can be paid with Payme', async () => {
    const { res } = await paymeOrder({ fiscal: false });
    expect(res.status).toBe(409);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('FISCAL_DATA_MISSING');
  });

  it('CheckPerformTransaction validates the order and the exact amount, and returns the receipt', async () => {
    const { order } = await placed();
    const account = { order_id: order.number };
    expect(
      (
        await rpc('CheckPerformTransaction', {
          amount: 300000,
          account: { order_id: 'UZ-2026-999999' },
        })
      ).error?.code,
    ).toBe(-31050);
    expect((await rpc('CheckPerformTransaction', { amount: 299999, account })).error?.code).toBe(
      -31001,
    );
    expect((await rpc('CheckPerformTransaction', { amount: 3000.0001, account })).error?.code).toBe(
      -31001,
    );
    const ok = await rpc('CheckPerformTransaction', { amount: 300000, account });
    expect(ok.result).toMatchObject({
      allow: true,
      detail: {
        receipt_type: 0,
        items: [
          {
            price: 150000,
            count: 2,
            code: '10202001001000000',
            package_code: '1500567',
            vat_percent: 12,
            commission_info: { tin: '301234567' },
          },
        ],
      },
    });

    const cod = await placed({ method: 'CASH_ON_DELIVERY' });
    expect(
      (
        await rpc('CheckPerformTransaction', {
          amount: 300000,
          account: { order_id: cod.order.number },
        })
      ).error?.code,
    ).toBe(-31051);
  });

  it('create → perform captures once; duplicates are idempotent; a second transaction is refused', async () => {
    const { order } = await placed();
    const params = {
      id: `payme-${randomUUID()}`,
      time: Date.now(),
      amount: 300000,
      account: { order_id: order.number },
    };
    const created = await rpc('CreateTransaction', params);
    expect(created.result?.state).toBe(1);
    const again = await rpc('CreateTransaction', params);
    expect(again.result?.transaction).toBe(created.result?.transaction);
    const other = await rpc('CreateTransaction', { ...params, id: `payme-${randomUUID()}` });
    expect(other.error?.code).toBe(-31051);

    // Concurrent duplicate PerformTransaction calls capture exactly once.
    const [a, b] = await Promise.all([
      rpc('PerformTransaction', { id: params.id }),
      rpc('PerformTransaction', { id: params.id }),
    ]);
    expect([a.result?.state, b.result?.state]).toEqual([2, 2]);
    expect(a.result?.perform_time).toBe(b.result?.perform_time);
    expect(
      await prisma.paymentAttempt.count({
        where: { order: { number: order.number }, status: 'PAID' },
      }),
    ).toBe(1);
    const row = await orderRow(order.number);
    expect(row.paidAt).not.toBeNull();
    expect(row.status).toBe('CREATED');

    const checked = await rpc('CheckTransaction', { id: params.id });
    expect(checked.result).toMatchObject({ state: 2, cancel_time: 0, reason: null });
    const statement = await rpc('GetStatement', {
      from: params.time - 1000,
      to: params.time + 1000,
    });
    const list = (statement.result?.transactions ?? []) as { id: string; amount: number }[];
    expect(list.find((t) => t.id === params.id)?.amount).toBe(300000);
    expect((await rpc('CheckTransaction', { id: 'unknown' })).error?.code).toBe(-31003);
  });

  it('concurrent duplicate CreateTransaction calls create one transaction', async () => {
    const { order } = await placed();
    const params = {
      id: `payme-${randomUUID()}`,
      time: Date.now(),
      amount: 300000,
      account: { order_id: order.number },
    };
    const [a, b] = await Promise.all([
      rpc('CreateTransaction', params),
      rpc('CreateTransaction', params),
    ]);
    expect(a.result?.transaction).toBeDefined();
    expect(a.result?.transaction).toBe(b.result?.transaction);
    expect(await prisma.paymentAttempt.count({ where: { providerTxId: params.id } })).toBe(1);
  });

  it('a cancelled created transaction cannot be performed; the order stays payable', async () => {
    const { order } = await placed();
    const params = {
      id: `payme-${randomUUID()}`,
      time: Date.now(),
      amount: 300000,
      account: { order_id: order.number },
    };
    await rpc('CreateTransaction', params);
    const cancelled = await rpc('CancelTransaction', { id: params.id, reason: 3 });
    expect(cancelled.result?.state).toBe(-1);
    expect((await rpc('PerformTransaction', { id: params.id })).error?.code).toBe(-31008);
    expect((await rpc('CancelTransaction', { id: params.id, reason: 3 })).result?.state).toBe(-1);
    expect((await orderRow(order.number)).status).toBe('AWAITING_PAYMENT');

    const retry = { ...params, id: `payme-${randomUUID()}` };
    expect((await rpc('CreateTransaction', retry)).result?.state).toBe(1);
    expect((await rpc('PerformTransaction', { id: retry.id })).result?.state).toBe(2);
  });

  it('cancelling a performed transaction refunds the whole order, unless it is already shipped', async () => {
    const { order, variantId } = await placed();
    const params = {
      id: `payme-${randomUUID()}`,
      time: Date.now(),
      amount: 300000,
      account: { order_id: order.number },
    };
    await rpc('CreateTransaction', params);
    await rpc('PerformTransaction', { id: params.id });
    expect(await stockOf(variantId)).toBe(2);
    const refunded = await rpc('CancelTransaction', { id: params.id, reason: 5 });
    expect(refunded.result?.state).toBe(-2);
    expect(await stockOf(variantId)).toBe(4);
    const row = await orderRow(order.number);
    expect(row.status).toBe('CANCELLED');
    expect(
      (await prisma.paymentAttempt.findFirstOrThrow({ where: { providerTxId: params.id } })).status,
    ).toBe('REFUNDED');

    // Shipped orders cannot be refunded through Payme (returns flow instead).
    const shipped = await placed();
    const p2 = {
      id: `payme-${randomUUID()}`,
      time: Date.now(),
      amount: 300000,
      account: { order_id: shipped.order.number },
    };
    await rpc('CreateTransaction', p2);
    await rpc('PerformTransaction', { id: p2.id });
    await prisma.sellerOrder.updateMany({
      where: { order: { number: shipped.order.number } },
      data: { status: 'HANDED_TO_DELIVERY' },
    });
    expect((await rpc('CancelTransaction', { id: p2.id, reason: 5 })).error?.code).toBe(-31007);
  });

  it('times out created transactions after 12 hours', async () => {
    const { order } = await placed();
    const params = {
      id: `payme-${randomUUID()}`,
      time: Date.now(),
      amount: 300000,
      account: { order_id: order.number },
    };
    await rpc('CreateTransaction', params);
    await prisma.paymentAttempt.updateMany({
      where: { providerTxId: params.id },
      data: { createdAt: new Date(Date.now() - 43_200_001) },
    });
    expect((await rpc('PerformTransaction', { id: params.id })).error?.code).toBe(-31008);
    const checked = await rpc('CheckTransaction', { id: params.id });
    expect(checked.result).toMatchObject({ state: -1, reason: 4 });
  });

  it('refuses payment for an order whose payment window has closed', async () => {
    const { order } = await placed();
    await prisma.order.update({
      where: { number: order.number },
      data: { paymentDueAt: new Date(Date.now() - 1000) },
    });
    const res = await rpc('CreateTransaction', {
      id: `payme-${randomUUID()}`,
      time: Date.now(),
      amount: 300000,
      account: { order_id: order.number },
    });
    expect(res.error?.code).toBe(-31051);
  });
});
