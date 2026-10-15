import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  apiErrorSchema,
  orderResponseSchema,
  paymentMethodsResponseSchema,
  sellerShipmentListSchema,
} from '@uzgo/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PaymentsService } from '../src/payments/payments.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, login, randomIp, TEST_ORIGIN } from './app.js';
import { createProduct, createStore, retireTestStores } from './fixtures.js';

const errorCode = (body: unknown) => apiErrorSchema.parse(body).error.code;

describe('online payments: core rules (simulated provider)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let districtId = '';
  const http = () => request(app.getHttpServer());
  const post = (path: string, cookie: string) =>
    http().post(`/api/v1${path}`).set('Cookie', cookie).set('Origin', TEST_ORIGIN);

  async function placeOrder(paymentMethod: string, stock = 5) {
    const seller = await login(app);
    const store = await createStore(prisma, { ownerId: seller.userId });
    const product = await createProduct(prisma, {
      storeId: store.id,
      variants: [{ priceTiyin: 2_000_00n, stock }],
    });
    const variantId = product.variants[0]?.id ?? '';
    const customer = await login(app);
    await post('/cart/items', customer.cookie).send({ variantId, quantity: 2 }).expect(201);
    const res = await post('/checkout', customer.cookie).set('Idempotency-Key', randomUUID()).send({
      recipientName: 'Ali Valiyev',
      recipientPhone: '+998901234567',
      districtId,
      addressLine: 'Alpomish koʻchasi, 1',
      paymentMethod,
      expectedTotalTiyin: '400000',
    });
    return { res, customer, seller, store, variantId };
  }

  const stockOf = async (variantId: string) =>
    (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock;

  beforeAll(async () => {
    app = await createTestApp({ env: { DEV_PAYMENTS_ENABLED: 'true' } });
    prisma = app.get(PrismaService);
    districtId = (await prisma.district.findUniqueOrThrow({ where: { slug: 'termiz_city' } })).id;
  });

  afterAll(async () => {
    await retireTestStores(prisma);
    await app.close();
  });

  it('offers only configured methods', async () => {
    const methods = paymentMethodsResponseSchema.parse(
      (await http().get('/api/v1/payments/methods').expect(200)).body,
    );
    expect(methods.items).toEqual(['CASH_ON_DELIVERY', 'DEV_ONLINE']);
    const { res } = await placeOrder('PAYME');
    expect(res.status).toBe(400);
    expect(errorCode(res.body)).toBe('PAYMENT_METHOD_UNAVAILABLE');
  });

  it('holds stock and hides the order from the seller until it is paid', async () => {
    const { res, customer, seller, store, variantId } = await placeOrder('DEV_ONLINE');
    expect(res.status).toBe(201);
    const { order } = orderResponseSchema.parse(res.body);
    expect(order.status).toBe('AWAITING_PAYMENT');
    expect(order.payment.status).toBe('UNPAID');
    expect(order.payment.dueAt).not.toBeNull();
    expect(order.sellerOrders[0]?.status).toBe('PENDING_PAYMENT');
    expect(order.sellerOrders[0]?.allowedTransitions).toEqual([]);
    expect(await stockOf(variantId)).toBe(3);

    const hidden = sellerShipmentListSchema.parse(
      (await http().get(`/api/v1/seller/orders?storeId=${store.id}`).set('Cookie', seller.cookie))
        .body,
    );
    expect(hidden.items).toHaveLength(0);

    const link = await http()
      .get(`/api/v1/orders/${order.number}/payment-link?locale=ru`)
      .set('Cookie', customer.cookie)
      .expect(200);
    expect((link.body as { url: string }).url).toMatch(/\/ru\/pay\/dev\/UZ-/);

    // A failed attempt keeps the order payable.
    await post(`/payments/dev/${order.number}`, customer.cookie)
      .send({ outcome: 'cancel' })
      .expect(200);
    const paid = orderResponseSchema.parse(
      (
        await post(`/payments/dev/${order.number}`, customer.cookie)
          .send({ outcome: 'success' })
          .expect(200)
      ).body,
    ).order;
    expect(paid.status).toBe('CREATED');
    expect(paid.payment.status).toBe('PAID');
    expect(paid.sellerOrders[0]?.status).toBe('NEW');

    // Paying twice is refused; the seller now sees the shipment.
    const twice = await post(`/payments/dev/${order.number}`, customer.cookie)
      .send({ outcome: 'success' })
      .expect(409);
    expect(errorCode(twice.body)).toBe('ORDER_NOT_PAYABLE');
    const visible = sellerShipmentListSchema.parse(
      (await http().get(`/api/v1/seller/orders?storeId=${store.id}`).set('Cookie', seller.cookie))
        .body,
    );
    expect(visible.items.map((s) => s.orderNumber)).toEqual([order.number]);

    const attempts = await prisma.paymentAttempt.findMany({
      where: { order: { number: order.number } },
      orderBy: { createdAt: 'asc' },
    });
    expect(attempts.map((a) => a.status)).toEqual(['CANCELLED', 'PAID']);
    expect(
      await prisma.auditEvent.findFirst({ where: { action: 'payment.captured' } }),
    ).not.toBeNull();
  });

  it('cancels unpaid orders only as a whole, and only by their owner', async () => {
    const { res, customer, variantId } = await placeOrder('DEV_ONLINE');
    const { order } = orderResponseSchema.parse(res.body);
    const shipment = order.sellerOrders[0]?.id ?? '';
    const partial = await post(
      `/orders/${order.number}/seller-orders/${shipment}/transition`,
      customer.cookie,
    )
      .send({ to: 'CANCELLED_BY_CUSTOMER' })
      .expect(409);
    expect(errorCode(partial.body)).toBe('INVALID_STATE_TRANSITION');

    const stranger = await login(app);
    await post(`/orders/${order.number}/cancel`, stranger.cookie).expect(404);
    await http()
      .get(`/api/v1/orders/${order.number}/payment-link`)
      .set('Cookie', stranger.cookie)
      .expect(404);
    await post(`/payments/dev/${order.number}`, stranger.cookie)
      .send({ outcome: 'success' })
      .expect(404);

    const cancelled = orderResponseSchema.parse(
      (await post(`/orders/${order.number}/cancel`, customer.cookie).expect(200)).body,
    ).order;
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.payment.status).toBe('EXPIRED');
    expect(await stockOf(variantId)).toBe(5);
    await post(`/orders/${order.number}/cancel`, customer.cookie).expect(409);
    await post(`/payments/dev/${order.number}`, customer.cookie)
      .send({ outcome: 'success' })
      .expect(409);
  });

  it('expires overdue unpaid orders and releases their stock', async () => {
    const payments = app.get(PaymentsService);
    const overdue = await placeOrder('DEV_ONLINE');
    const overdueOrder = orderResponseSchema.parse(overdue.res.body).order;
    const pending = await placeOrder('DEV_ONLINE');
    const pendingOrder = orderResponseSchema.parse(pending.res.body).order;
    const past = new Date(Date.now() - 60_000);
    await prisma.order.updateMany({
      where: { number: { in: [overdueOrder.number, pendingOrder.number] } },
      data: { paymentDueAt: past },
    });
    // A provider transaction still open keeps its order alive (the provider times it out).
    const pendingRow = await prisma.order.findUniqueOrThrow({
      where: { number: pendingOrder.number },
    });
    await prisma.paymentAttempt.create({
      data: {
        orderId: pendingRow.id,
        method: 'DEV_ONLINE',
        amountTiyin: pendingRow.totalTiyin,
        providerTxId: `dev-${randomUUID()}`,
      },
    });

    expect(await payments.expireOverdue()).toBeGreaterThanOrEqual(1);
    const expired = await prisma.order.findUniqueOrThrow({
      where: { number: overdueOrder.number },
    });
    expect(expired.status).toBe('CANCELLED');
    expect(await stockOf(overdue.variantId)).toBe(5);
    const kept = await prisma.order.findUniqueOrThrow({ where: { number: pendingOrder.number } });
    expect(kept.status).toBe('AWAITING_PAYMENT');

    // Too late to pay an expired order.
    await post(`/payments/dev/${overdueOrder.number}`, overdue.customer.cookie)
      .send({ outcome: 'success' })
      .expect(409);
  });

  it('keeps cash on delivery unchanged', async () => {
    const { res } = await placeOrder('CASH_ON_DELIVERY');
    const { order } = orderResponseSchema.parse(res.body);
    expect(order.status).toBe('CREATED');
    expect(order.payment).toEqual({ status: 'NOT_REQUIRED', dueAt: null, paidAt: null });
    expect(order.sellerOrders[0]?.status).toBe('NEW');
  });

  it('caps open unpaid online orders per customer (stock hoarding)', async () => {
    const seller = await login(app);
    const store = await createStore(prisma, { ownerId: seller.userId });
    const product = await createProduct(prisma, {
      storeId: store.id,
      variants: [{ priceTiyin: 1_000_00n, stock: 50 }],
    });
    const variantId = product.variants[0]?.id ?? '';
    const customer = await login(app);
    // Own client IP: the checkout throttle (10/min per IP) is not what this test is about.
    const ip = randomIp();
    const order = async (paymentMethod: string, addToCart = true) => {
      if (addToCart) {
        await post('/cart/items', customer.cookie).send({ variantId, quantity: 1 }).expect(201);
      }
      return post('/checkout', customer.cookie)
        .set('X-Forwarded-For', ip)
        .set('Idempotency-Key', randomUUID())
        .send({
          recipientName: 'Ali Valiyev',
          recipientPhone: '+998901234567',
          districtId,
          addressLine: 'Alpomish koʻchasi, 1',
          paymentMethod,
          expectedTotalTiyin: '100000',
        });
    };
    for (let i = 0; i < 3; i += 1) {
      const res = await order('DEV_ONLINE');
      expect(res.status, JSON.stringify(res.body)).toBe(201);
    }
    const fourth = await order('DEV_ONLINE');
    expect(fourth.status).toBe(409);
    expect(errorCode(fourth.body)).toBe('TOO_MANY_UNPAID_ORDERS');
    expect(await stockOf(variantId)).toBe(47);
    // Cash on delivery stays allowed (the rejected order's item is still in the cart).
    const cod = await order('CASH_ON_DELIVERY', false);
    expect(cod.status, JSON.stringify(cod.body)).toBe(201);
  });
});
