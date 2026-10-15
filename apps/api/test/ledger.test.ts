import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  adminRefundListResponseSchema,
  apiErrorSchema,
  ledgerSummarySchema,
  orderResponseSchema,
  storeFinanceSchema,
} from '@uzgo/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, login, loginStaff, randomIp, TEST_ORIGIN } from './app.js';
import { createProduct, createStore, retireTestStores } from './fixtures.js';

const KEY = 'payme-ledger-key-0123456789';
const AUTH = `Basic ${Buffer.from(`Paycom:${KEY}`).toString('base64')}`;
const errorCode = (body: unknown) => apiErrorSchema.parse(body).error.code;

describe('ledger, commission, refunds and payouts', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: Awaited<ReturnType<typeof loginStaff>>;
  let districtId = '';
  const http = () => request(app.getHttpServer());
  const send = (method: 'post' | 'put' | 'patch', path: string, cookie: string, body?: object) => {
    const server = http();
    return server[method](`/api/v1${path}`)
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .set('X-Forwarded-For', randomIp())
      .send(body);
  };

  /** A store (10 % commission) with one product: 2 000 soʻm, IKPU set. */
  async function shop() {
    const owner = await login(app);
    const store = await createStore(prisma, { ownerId: owner.userId });
    await send('patch', `/admin/stores/${store.id}/commission`, admin.cookie, {
      commissionBp: 1000,
    }).expect(204);
    const product = await createProduct(prisma, {
      storeId: store.id,
      variants: [{ priceTiyin: 2_000_00n, stock: 10 }],
    });
    const variantId = product.variants[0]?.id ?? '';
    await prisma.productVariant.update({
      where: { id: variantId },
      data: { mxikCode: '10202001001000000', packageCode: '1500567' },
    });
    return { owner, store, variantId };
  }

  /** Buys 2 items (400 000 tiyin) with the given method; online orders get paid. */
  async function buy(variantId: string, method: 'DEV_ONLINE' | 'PAYME' | 'CASH_ON_DELIVERY') {
    const customer = await login(app);
    await send('post', '/cart/items', customer.cookie, { variantId, quantity: 2 }).expect(201);
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
        expectedTotalTiyin: '400000',
      })
      .expect(201);
    const { order } = orderResponseSchema.parse(res.body);
    if (method === 'DEV_ONLINE') {
      await send('post', `/payments/dev/${order.number}`, customer.cookie, {
        outcome: 'success',
      }).expect(200);
    }
    if (method === 'PAYME') {
      const id = `payme-${randomUUID()}`;
      const rpc = (m: string, params: object) =>
        http()
          .post('/api/v1/payments/payme')
          .set('Authorization', AUTH)
          .send({ id: 1, method: m, params })
          .expect(200);
      await rpc('CreateTransaction', {
        id,
        time: Date.now(),
        amount: 400000,
        account: { order_id: order.number },
      });
      await rpc('PerformTransaction', { id });
    }
    return { customer, order, shipmentId: order.sellerOrders[0]?.id ?? '' };
  }

  const move = (cookie: string, shipmentId: string, to: string) =>
    send('post', `/seller/seller-orders/${shipmentId}/transition`, cookie, { to });

  async function deliver(cookie: string, shipmentId: string) {
    for (const to of ['ACCEPTED', 'PACKED', 'HANDED_TO_DELIVERY', 'DELIVERED']) {
      await move(cookie, shipmentId, to).expect(204);
    }
  }

  const finance = async (cookie: string, storeId: string) =>
    storeFinanceSchema.parse(
      (
        await http()
          .get(`/api/v1/seller/stores/${storeId}/finance`)
          .set('Cookie', cookie)
          .expect(200)
      ).body,
    );

  const journalsOf = (orderId: string) =>
    prisma.ledgerEntry.groupBy({ by: ['kind'], where: { orderId }, _sum: { amountTiyin: true } });

  beforeAll(async () => {
    app = await createTestApp({
      env: {
        DEV_PAYMENTS_ENABLED: 'true',
        PAYME_MERCHANT_ID: 'ledger-merchant',
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

  it('snapshots the commission and splits a delivered online sale', async () => {
    const { owner, store, variantId } = await shop();
    const { order, shipmentId } = await buy(variantId, 'DEV_ONLINE');
    const row = await prisma.sellerOrder.findUniqueOrThrow({ where: { id: shipmentId } });
    expect(row.commissionTiyin).toBe(40_000n);
    // Changing the rate later never changes existing orders.
    await send('patch', `/admin/stores/${store.id}/commission`, admin.cookie, {
      commissionBp: 2000,
    }).expect(204);
    expect(
      (await prisma.sellerOrder.findUniqueOrThrow({ where: { id: shipmentId } })).commissionTiyin,
    ).toBe(40_000n);

    expect((await finance(owner.cookie, store.id)).balanceTiyin).toBe('0');
    await deliver(owner.cookie, shipmentId);
    const money = await finance(owner.cookie, store.id);
    expect(money).toMatchObject({
      balanceTiyin: '360000',
      availableTiyin: '360000',
      heldTiyin: '0',
    });
    expect(money.lines[0]).toMatchObject({ kind: 'shipment_delivered', amountTiyin: '360000' });

    const orderId = (await prisma.order.findUniqueOrThrow({ where: { number: order.number } })).id;
    const entries = await prisma.ledgerEntry.findMany({ where: { orderId } });
    const byAccount = (account: string) =>
      entries.filter((e) => e.account === account).reduce((sum, e) => sum + e.amountTiyin, 0n);
    expect(byAccount('PROVIDER_CLEARING')).toBe(400_000n);
    expect(byAccount('CUSTOMER_PREPAYMENTS')).toBe(0n);
    expect(byAccount('SELLER_PAYABLE')).toBe(-360_000n);
    expect(byAccount('PLATFORM_REVENUE')).toBe(-40_000n);
  });

  it('cash on delivery: the seller owes the commission', async () => {
    const { owner, store, variantId } = await shop();
    const { shipmentId } = await buy(variantId, 'CASH_ON_DELIVERY');
    await deliver(owner.cookie, shipmentId);
    const money = await finance(owner.cookie, store.id);
    expect(money.balanceTiyin).toBe('-40000');
    expect(money.availableTiyin).toBe('0');
  });

  it('cancelling a paid shipment creates a refund; staff complete it; the ledger returns the money', async () => {
    const { owner, variantId } = await shop();
    const { order, shipmentId } = await buy(variantId, 'PAYME');
    await move(owner.cookie, shipmentId, 'CANCELLED_BY_SELLER').expect(204);

    const pending = adminRefundListResponseSchema.parse(
      (
        await http()
          .get('/api/v1/admin/refunds?status=PENDING')
          .set('Cookie', admin.cookie)
          .expect(200)
      ).body,
    );
    const refund = pending.items.find((r) => r.orderNumber === order.number);
    expect(refund).toMatchObject({
      amountTiyin: '400000',
      method: 'PAYME',
      reason: 'shipment_cancelled',
    });
    const id = refund?.id ?? '';

    await send('post', `/admin/refunds/${id}/succeed`, admin.cookie, {}).expect(400);
    await send('post', `/admin/refunds/${id}/succeed`, admin.cookie, {
      reference: 'PM-REF-001',
    }).expect(204);
    const again = await send('post', `/admin/refunds/${id}/succeed`, admin.cookie, {
      reference: 'PM-REF-001',
    }).expect(409);
    expect(errorCode(again.body)).toBe('INVALID_TRANSITION');

    const orderId = (await prisma.order.findUniqueOrThrow({ where: { number: order.number } })).id;
    const sums = await journalsOf(orderId);
    expect(sums.map((s) => s.kind).sort()).toEqual(['payment_captured', 'refund']);
    const clearing = await prisma.ledgerEntry.aggregate({
      where: { orderId, account: 'PROVIDER_CLEARING' },
      _sum: { amountTiyin: true },
    });
    expect(clearing._sum.amountTiyin).toBe(0n);
    // One open refund per shipment, enforced by the database too.
    await expect(
      prisma.refund.create({
        data: {
          orderId,
          sellerOrderId: shipmentId,
          paymentAttemptId: (await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId } }))
            .id,
          amountTiyin: 1n,
          reason: 'duplicate',
        },
      }),
    ).rejects.toThrow();
  });

  it('a return reverses the sale and refunds the customer', async () => {
    const { owner, store, variantId } = await shop();
    const { order, customer, shipmentId } = await buy(variantId, 'DEV_ONLINE');
    await deliver(owner.cookie, shipmentId);
    await send(
      'post',
      `/orders/${order.number}/seller-orders/${shipmentId}/transition`,
      customer.cookie,
      {
        to: 'RETURN_REQUESTED',
      },
    ).expect(200);
    await move(owner.cookie, shipmentId, 'RETURNED').expect(204);
    expect((await finance(owner.cookie, store.id)).balanceTiyin).toBe('0');
    const refund = await prisma.refund.findFirstOrThrow({ where: { sellerOrderId: shipmentId } });
    // The simulated provider returns money at once.
    expect(refund).toMatchObject({
      status: 'SUCCEEDED',
      reason: 'returned',
      amountTiyin: 400_000n,
    });
  });

  it('pays out only the available balance, to saved bank details, once', async () => {
    const { owner, store, variantId } = await shop();
    const { shipmentId } = await buy(variantId, 'DEV_ONLINE');
    await deliver(owner.cookie, shipmentId);

    const noDetails = await send('post', `/admin/stores/${store.id}/payouts`, admin.cookie, {
      amountTiyin: '1000',
    }).expect(409);
    expect(errorCode(noDetails.body)).toBe('PAYOUT_DETAILS_MISSING');

    // Bank details: owner only, validated.
    const staff = await login(app);
    await prisma.storeMember.create({
      data: { storeId: store.id, userId: staff.userId, role: 'STAFF' },
    });
    const details = {
      bankName: 'Sinov bank',
      mfo: '00873',
      account: '20208000900123456001',
      recipient: 'MChJ Sinov',
    };
    await send('put', `/seller/stores/${store.id}/payout-details`, staff.cookie, details).expect(
      403,
    );
    await http()
      .get(`/api/v1/seller/stores/${store.id}/finance`)
      .set('Cookie', staff.cookie)
      .expect(403);
    await send('put', `/seller/stores/${store.id}/payout-details`, owner.cookie, {
      ...details,
      account: '123',
    }).expect(400);
    await send('put', `/seller/stores/${store.id}/payout-details`, owner.cookie, details).expect(
      200,
    );
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'store.payout_details_changed', entityId: store.id },
    });
    expect(JSON.stringify(audit.metadata)).not.toContain(details.account);

    const tooMuch = await send('post', `/admin/stores/${store.id}/payouts`, admin.cookie, {
      amountTiyin: '360001',
    }).expect(409);
    expect(errorCode(tooMuch.body)).toBe('PAYOUT_EXCEEDS_BALANCE');
    const created = await send('post', `/admin/stores/${store.id}/payouts`, admin.cookie, {
      amountTiyin: '360000',
    }).expect(201);
    const payoutId = (created.body as { payout: { id: string } }).payout.id;
    // The pending payout reserves the balance: no second payout.
    await send('post', `/admin/stores/${store.id}/payouts`, admin.cookie, {
      amountTiyin: '1',
    }).expect(409);

    await send('post', `/admin/payouts/${payoutId}/paid`, admin.cookie, {
      reference: 'BANK-777',
    }).expect(200);
    await send('post', `/admin/payouts/${payoutId}/cancel`, admin.cookie).expect(409);
    const money = await finance(owner.cookie, store.id);
    expect(money).toMatchObject({ balanceTiyin: '0', availableTiyin: '0' });
    expect(money.payouts[0]).toMatchObject({
      status: 'PAID',
      reference: 'BANK-777',
      amountTiyin: '360000',
    });
  });

  it('keeps recent earnings on hold during the return window', async () => {
    const { owner, store, variantId } = await shop();
    const { shipmentId } = await buy(variantId, 'DEV_ONLINE');
    await deliver(owner.cookie, shipmentId);
    const held = await createTestApp({ env: { PAYOUT_HOLD_DAYS: '10' } });
    try {
      const res = await request(held.getHttpServer())
        .get(`/api/v1/seller/stores/${store.id}/finance`)
        .set('Cookie', owner.cookie)
        .expect(200);
      expect(storeFinanceSchema.parse(res.body)).toMatchObject({
        balanceTiyin: '360000',
        heldTiyin: '360000',
        availableTiyin: '0',
        holdDays: 10,
      });
    } finally {
      await held.close();
    }
  });

  it('the ledger always balances and cannot be edited', async () => {
    const summary = ledgerSummarySchema.parse(
      (await http().get('/api/v1/admin/ledger').set('Cookie', admin.cookie).expect(200)).body,
    );
    expect(summary.total).toBe('0');

    const entry = await prisma.ledgerEntry.findFirstOrThrow();
    await expect(
      prisma.ledgerEntry.update({ where: { id: entry.id }, data: { kind: 'tampered' } }),
    ).rejects.toThrow();
    await expect(prisma.ledgerEntry.delete({ where: { id: entry.id } })).rejects.toThrow();
    // A one-sided journal is rejected at commit.
    await expect(
      prisma.ledgerEntry.create({
        data: {
          journalId: randomUUID(),
          account: 'PLATFORM_REVENUE',
          amountTiyin: 5n,
          kind: 'manual',
        },
      }),
    ).rejects.toThrow(/does not balance/);
  });

  it('finance routes are closed to customers, other sellers and moderators', async () => {
    const { store } = await shop();
    const stranger = await login(app);
    await http()
      .get(`/api/v1/seller/stores/${store.id}/finance`)
      .set('Cookie', stranger.cookie)
      .expect(404);
    const moderator = await loginStaff(app, 'MODERATOR');
    await http().get('/api/v1/admin/refunds').set('Cookie', moderator.cookie).expect(403);
    await http().get('/api/v1/admin/ledger').set('Cookie', stranger.cookie).expect(403);
    await send('post', `/admin/stores/${store.id}/payouts`, moderator.cookie, {
      amountTiyin: '1',
    }).expect(403);
  });
});
