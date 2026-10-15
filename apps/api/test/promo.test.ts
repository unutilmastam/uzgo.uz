import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  adminPromoListSchema,
  apiErrorSchema,
  deliveryQuoteSchema,
  ledgerSummarySchema,
  orderResponseSchema,
  storeFinanceSchema,
} from '@uzgo/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, login, loginStaff, randomIp, TEST_ORIGIN } from './app.js';
import { createProduct, createStore, retireTestStores } from './fixtures.js';

const KEY = 'payme-promo-key-0123456789';
const AUTH = `Basic ${Buffer.from(`Paycom:${KEY}`).toString('base64')}`;
const errorCode = (body: unknown) => apiErrorSchema.parse(body).error.code;
const uniqueCode = (prefix: string) =>
  `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`.slice(0, 32);

describe('promo codes (UZGO-funded, ADR 0023)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: Awaited<ReturnType<typeof loginStaff>>;
  let districtId = '';
  const http = () => request(app.getHttpServer());
  const send = (method: 'post' | 'patch', path: string, cookie: string, body?: object) => {
    const server = http();
    return server[method](`/api/v1${path}`)
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .set('X-Forwarded-For', randomIp())
      .send(body);
  };

  async function createPromo(body: Record<string, unknown>) {
    const code = uniqueCode('UZGO');
    await send('post', '/admin/promo-codes', admin.cookie, { code, ...body }).expect(201);
    return code;
  }

  /** A store with one product (10 % commission, fiscal data set). */
  async function shop(priceTiyin: bigint, stock = 50) {
    const owner = await login(app);
    const store = await createStore(prisma, { ownerId: owner.userId });
    await send('patch', `/admin/stores/${store.id}/commission`, admin.cookie, {
      commissionBp: 1000,
    }).expect(204);
    const product = await createProduct(prisma, {
      storeId: store.id,
      variants: [{ priceTiyin, stock }],
    });
    const variantId = product.variants[0]?.id ?? '';
    await prisma.productVariant.update({
      where: { id: variantId },
      data: { mxikCode: '10202001001000000', packageCode: '1500567' },
    });
    return { owner, store, variantId };
  }

  async function cart(customerCookie: string, lines: { variantId: string; quantity: number }[]) {
    for (const line of lines) {
      await send('post', '/cart/items', customerCookie, line).expect(201);
    }
  }

  const quote = async (cookie: string, promoCode?: string) =>
    deliveryQuoteSchema.parse(
      (
        await http()
          .get('/api/v1/delivery/quote')
          .query({ districtId, ...(promoCode ? { promoCode } : {}) })
          .set('Cookie', cookie)
          .expect(200)
      ).body,
    );

  const checkout = (
    cookie: string,
    body: { promoCode?: string; expectedTotalTiyin: string; paymentMethod?: string },
  ) =>
    http()
      .post('/api/v1/checkout')
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .set('X-Forwarded-For', randomIp())
      .set('Idempotency-Key', randomUUID())
      .send({
        recipientName: 'Ali Valiyev',
        recipientPhone: '+998901234567',
        districtId,
        addressLine: 'Alpomish koʻchasi, 1',
        paymentMethod: 'CASH_ON_DELIVERY',
        ...body,
      });

  const move = (cookie: string, shipmentId: string, to: string) =>
    send('post', `/seller/seller-orders/${shipmentId}/transition`, cookie, { to });

  async function deliver(cookie: string, shipmentId: string) {
    for (const to of ['ACCEPTED', 'PACKED', 'HANDED_TO_DELIVERY', 'DELIVERED']) {
      await move(cookie, shipmentId, to).expect(204);
    }
  }

  const balance = async (cookie: string, storeId: string) =>
    storeFinanceSchema.parse(
      (
        await http()
          .get(`/api/v1/seller/stores/${storeId}/finance`)
          .set('Cookie', cookie)
          .expect(200)
      ).body,
    ).balanceTiyin;

  beforeAll(async () => {
    app = await createTestApp({
      env: {
        DEV_PAYMENTS_ENABLED: 'true',
        PAYME_MERCHANT_ID: 'promo-merchant',
        PAYME_KEY: KEY,
        PAYOUT_HOLD_DAYS: '0',
      },
    });
    prisma = app.get(PrismaService);
    admin = await loginStaff(app, 'ADMIN');
    districtId = (await prisma.district.findUniqueOrThrow({ where: { slug: 'termiz_city' } })).id;
  });

  afterAll(async () => {
    await retireTestStores(prisma);
    await app.close();
  });

  it('lets only admins manage codes, validates terms and audits changes', async () => {
    const customer = await login(app);
    const code = uniqueCode('ADM');
    await send('post', '/admin/promo-codes', customer.cookie, {
      code,
      kind: 'FIXED',
      amountTiyin: '1000',
    }).expect(403);
    const moderator = await loginStaff(app, 'MODERATOR');
    await send('post', '/admin/promo-codes', moderator.cookie, {
      code,
      kind: 'FIXED',
      amountTiyin: '1000',
    }).expect(403);

    // Mixed or missing terms are refused.
    await send('post', '/admin/promo-codes', admin.cookie, {
      code,
      kind: 'PERCENT',
      amountTiyin: '1000',
    }).expect(400);
    await send('post', '/admin/promo-codes', admin.cookie, {
      code,
      kind: 'PERCENT',
      percentBp: 9500,
    }).expect(400);
    await send('post', '/admin/promo-codes', admin.cookie, {
      code: 'a b',
      kind: 'FIXED',
      amountTiyin: '1000',
    }).expect(400);

    const created = await send('post', '/admin/promo-codes', admin.cookie, {
      code: code.toLowerCase(),
      kind: 'PERCENT',
      percentBp: 1500,
      maxDiscountTiyin: '5000000',
      description: 'Kuzgi chegirma',
    }).expect(201);
    const promo = (created.body as { promo: { id: string; code: string } }).promo;
    expect(promo.code).toBe(code);
    const duplicate = await send('post', '/admin/promo-codes', admin.cookie, {
      code,
      kind: 'FIXED',
      amountTiyin: '1000',
    }).expect(409);
    expect(errorCode(duplicate.body)).toBe('PROMO_CODE_TAKEN');

    await send('patch', `/admin/promo-codes/${promo.id}`, admin.cookie, { active: false }).expect(
      200,
    );
    const list = adminPromoListSchema.parse(
      (await http().get('/api/v1/admin/promo-codes').set('Cookie', admin.cookie).expect(200)).body,
    );
    expect(list.items.find((p) => p.id === promo.id)).toMatchObject({
      active: false,
      percentBp: 1500,
      used: 0,
    });
    expect(
      await prisma.auditEvent.count({
        where: { entityId: promo.id, action: { in: ['promo.created', 'promo.updated'] } },
      }),
    ).toBe(2);
  });

  it('quotes and applies a discount on items only, split over lines and shipments', async () => {
    const a = await shop(300_00n);
    const b = await shop(100_00n);
    const code = await createPromo({ kind: 'PERCENT', percentBp: 1000 });
    const customer = await login(app);
    await cart(customer.cookie, [
      { variantId: a.variantId, quantity: 1 },
      { variantId: b.variantId, quantity: 1 },
    ]);

    const plain = await quote(customer.cookie);
    const q = await quote(customer.cookie, code.toLowerCase());
    expect(q.promo?.code).toBe(code);
    expect(q.discountTiyin).toBe('4000');
    expect(BigInt(q.totalTiyin)).toBe(BigInt(plain.totalTiyin) - 4_000n);
    expect(q.deliveryTotalTiyin).toBe(plain.deliveryTotalTiyin);

    // The total without the discount is now a stale price.
    const stale = await checkout(customer.cookie, {
      promoCode: code,
      expectedTotalTiyin: plain.totalTiyin,
    }).expect(422);
    expect(errorCode(stale.body)).toBe('PRICE_CHANGED');

    const res = await checkout(customer.cookie, {
      promoCode: code,
      expectedTotalTiyin: q.totalTiyin,
    }).expect(201);
    const { order } = orderResponseSchema.parse(res.body);
    expect(order).toMatchObject({
      discountTiyin: '4000',
      promoCode: code,
      totalTiyin: q.totalTiyin,
    });
    const shares = order.sellerOrders.map((so) => so.discountTiyin).sort();
    expect(shares).toEqual(['1000', '3000']);
    const items = await prisma.orderItem.findMany({
      where: { sellerOrder: { order: { number: order.number } } },
    });
    expect(items.reduce((s, i) => s + i.discountTiyin, 0n)).toBe(4_000n);

    // The money columns cannot be edited afterwards.
    await expect(
      prisma.order.update({ where: { number: order.number }, data: { discountTiyin: 0n } }),
    ).rejects.toThrow();
  });

  it('refuses unusable codes with a reason', async () => {
    const s = await shop(100_00n);
    const customer = await login(app);
    await cart(customer.cookie, [{ variantId: s.variantId, quantity: 1 }]);

    expect((await quote(customer.cookie, 'NO-SUCH-CODE')).promoError).toBe('PROMO_INVALID');
    const expired = await createPromo({
      kind: 'FIXED',
      amountTiyin: '1000',
      startsAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      endsAt: new Date(Date.now() - 86_400_000).toISOString(),
    });
    expect((await quote(customer.cookie, expired)).promoError).toBe('PROMO_EXPIRED');
    const big = await createPromo({ kind: 'FIXED', amountTiyin: '1000', minOrderTiyin: '50000' });
    const minQuote = await quote(customer.cookie, big);
    expect(minQuote).toMatchObject({
      promoError: 'PROMO_MIN_ORDER',
      promoMinOrderTiyin: '50000',
      discountTiyin: '0',
    });

    const plain = await quote(customer.cookie);
    const refused = await checkout(customer.cookie, {
      promoCode: big,
      expectedTotalTiyin: plain.totalTiyin,
    }).expect(422);
    expect(errorCode(refused.body)).toBe('PROMO_MIN_ORDER');
    // Nothing was reserved.
    expect(
      (await prisma.productVariant.findUniqueOrThrow({ where: { id: s.variantId } })).stock,
    ).toBe(50);
  });

  it('counts uses per customer and in total, under concurrent checkouts', async () => {
    const s = await shop(100_00n);
    const code = await createPromo({ kind: 'FIXED', amountTiyin: '1000', usageLimit: 2 });
    const customers = await Promise.all([1, 2, 3, 4].map(() => login(app)));
    for (const c of customers) await cart(c.cookie, [{ variantId: s.variantId, quantity: 1 }]);
    const q = await quote(customers[0]?.cookie ?? '', code);

    const results = await Promise.all(
      customers.map((c) =>
        checkout(c.cookie, { promoCode: code, expectedTotalTiyin: q.totalTiyin }),
      ),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 201, 422, 422]);
    for (const r of results.filter((x) => x.status === 422)) {
      expect(errorCode(r.body)).toBe('PROMO_LIMIT_REACHED');
    }

    // A customer cancelling gives the use back.
    const winner = results.findIndex((r) => r.status === 201);
    const placed = orderResponseSchema.parse(results[winner]?.body).order;
    await send(
      'post',
      `/orders/${placed.number}/seller-orders/${placed.sellerOrders[0]?.id ?? ''}/transition`,
      customers[winner]?.cookie ?? '',
      { to: 'CANCELLED_BY_CUSTOMER' },
    ).expect(200);
    const loser = results.findIndex((r) => r.status === 422);
    await checkout(customers[loser]?.cookie ?? '', {
      promoCode: code,
      expectedTotalTiyin: q.totalTiyin,
    }).expect(201);

    // perUserLimit (1): the same customer cannot use it twice.
    const again = results.findIndex((r, i) => r.status === 201 && i !== winner);
    await cart(customers[again]?.cookie ?? '', [{ variantId: s.variantId, quantity: 1 }]);
    expect((await quote(customers[again]?.cookie ?? '', code)).promoError).toBe(
      'PROMO_LIMIT_REACHED',
    );
  });

  it('pays the seller in full and books the discount as UZGO expense (cash)', async () => {
    const s = await shop(200_00n);
    const code = await createPromo({ kind: 'FIXED', amountTiyin: '5000' });
    const customer = await login(app);
    await cart(customer.cookie, [{ variantId: s.variantId, quantity: 2 }]);
    const q = await quote(customer.cookie, code);
    const { order } = orderResponseSchema.parse(
      (
        await checkout(customer.cookie, {
          promoCode: code,
          expectedTotalTiyin: q.totalTiyin,
        }).expect(201)
      ).body,
    );
    const shipmentId = order.sellerOrders[0]?.id ?? '';
    await deliver(s.owner.cookie, shipmentId);
    // The seller collected 40 000 − 5 000 in cash, owes 4 000 commission and
    // is owed the 5 000 discount: UZGO owes the store 1 000.
    expect(await balance(s.owner.cookie, s.store.id)).toBe('1000');
    const journal = await prisma.ledgerEntry.findMany({ where: { sellerOrderId: shipmentId } });
    expect(journal.reduce((sum, e) => sum + e.amountTiyin, 0n)).toBe(0n);
    expect(journal.find((e) => e.account === 'PLATFORM_PROMOTIONS')?.amountTiyin).toBe(5_000n);

    // A return reverses all of it.
    await send(
      'post',
      `/orders/${order.number}/seller-orders/${shipmentId}/transition`,
      customer.cookie,
      { to: 'RETURN_REQUESTED', returnReason: 'DEFECTIVE', returnComment: 'Ishlamayapti' },
    ).expect(200);
    await move(s.owner.cookie, shipmentId, 'RETURNED').expect(204);
    expect(await balance(s.owner.cookie, s.store.id)).toBe('0');
    const summary = ledgerSummarySchema.parse(
      (await http().get('/api/v1/admin/ledger').set('Cookie', admin.cookie).expect(200)).body,
    );
    expect(summary.total).toBe('0');
  });

  it('refunds what the customer paid and fills the Payme receipt (online)', async () => {
    const s = await shop(200_00n);
    await prisma.store.update({ where: { id: s.store.id }, data: { taxId: '301234567' } });
    const code = await createPromo({ kind: 'PERCENT', percentBp: 2500 });
    const customer = await login(app);
    await cart(customer.cookie, [{ variantId: s.variantId, quantity: 3 }]);
    const q = await quote(customer.cookie, code);
    expect(q.discountTiyin).toBe('15000');

    const payme = await checkout(customer.cookie, {
      promoCode: code,
      expectedTotalTiyin: q.totalTiyin,
      paymentMethod: 'PAYME',
    }).expect(201);
    const paymeOrder = orderResponseSchema.parse(payme.body).order;
    const check = await http()
      .post('/api/v1/payments/payme')
      .set('Authorization', AUTH)
      .send({
        id: 1,
        method: 'CheckPerformTransaction',
        params: { amount: Number(q.totalTiyin), account: { order_id: paymeOrder.number } },
      })
      .expect(200);
    const detail = (
      check.body as {
        result: {
          detail: {
            items: { price: number; count: number; discount?: number }[];
            shipping?: { price: number };
          };
        };
      }
    ).result.detail;
    const lines = detail.items.reduce((sum, i) => sum + i.price * i.count - (i.discount ?? 0), 0);
    expect(lines + (detail.shipping?.price ?? 0)).toBe(Number(q.totalTiyin));
    expect(detail.items[0]?.discount).toBe(15_000);

    // Same cart again with the simulated provider: delivered, then returned.
    await send(
      'post',
      `/orders/${paymeOrder.number}/seller-orders/${paymeOrder.sellerOrders[0]?.id ?? ''}/transition`,
      customer.cookie,
      { to: 'CANCELLED_BY_CUSTOMER' },
    );
    const other = await login(app);
    await cart(other.cookie, [{ variantId: s.variantId, quantity: 3 }]);
    const q2 = await quote(other.cookie, code);
    const { order } = orderResponseSchema.parse(
      (
        await checkout(other.cookie, {
          promoCode: code,
          expectedTotalTiyin: q2.totalTiyin,
          paymentMethod: 'DEV_ONLINE',
        }).expect(201)
      ).body,
    );
    await send('post', `/payments/dev/${order.number}`, other.cookie, {
      outcome: 'success',
    }).expect(200);
    const shipmentId = order.sellerOrders[0]?.id ?? '';
    await deliver(s.owner.cookie, shipmentId);
    // Seller: 60 000 − 6 000 commission, regardless of the discount.
    expect(await balance(s.owner.cookie, s.store.id)).toBe('54000');
    await send(
      'post',
      `/orders/${order.number}/seller-orders/${shipmentId}/transition`,
      other.cookie,
      { to: 'RETURN_REQUESTED', returnReason: 'NOT_AS_DESCRIBED', returnComment: 'Rangi boshqa' },
    ).expect(200);
    await move(s.owner.cookie, shipmentId, 'RETURNED').expect(204);
    const refund = await prisma.refund.findFirstOrThrow({ where: { sellerOrderId: shipmentId } });
    expect(refund.amountTiyin).toBe(BigInt(q2.totalTiyin));
    expect(await balance(s.owner.cookie, s.store.id)).toBe('0');
  });
});
