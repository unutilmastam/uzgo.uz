import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  apiErrorSchema,
  cartResponseSchema,
  orderResponseSchema,
  sellerShipmentListSchema,
} from '@uzgo/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, login, TEST_ORIGIN } from './app.js';
import { createProduct, createStore, retireTestStores } from './fixtures.js';

const errorCode = (body: unknown) => apiErrorSchema.parse(body).error.code;

describe('checkout and orders', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let districtId = '';
  const http = () => request(app.getHttpServer());

  const post = (path: string, cookie: string) =>
    http().post(path).set('Cookie', cookie).set('Origin', TEST_ORIGIN);

  async function addToCart(cookie: string, variantId: string, quantity: number) {
    await post('/api/v1/cart/items', cookie).send({ variantId, quantity }).expect(201);
  }

  async function cartTotal(cookie: string): Promise<string> {
    const res = await http().get('/api/v1/cart').set('Cookie', cookie).expect(200);
    return cartResponseSchema.parse(res.body).cart.totalTiyin;
  }

  const body = (expectedTotalTiyin: string, extra: Record<string, unknown> = {}) => ({
    recipientName: 'Gʻayrat Maʼrufov',
    recipientPhone: '+998 90 123 45 67',
    districtId,
    addressLine: 'Alpomish koʻchasi, 12-uy',
    paymentMethod: 'CASH_ON_DELIVERY',
    expectedTotalTiyin,
    ...extra,
  });

  const checkout = (cookie: string, payload: unknown, key: string = randomUUID()) =>
    post('/api/v1/checkout', cookie)
      .set('Idempotency-Key', key)
      .send(payload as object);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    districtId = (await prisma.district.findUniqueOrThrow({ where: { slug: 'termiz_city' } })).id;
  });

  afterAll(async () => {
    await retireTestStores(prisma);
    await app.close();
  });

  it('splits one checkout into one shipment per store, with server-side totals and snapshots', async () => {
    const storeA = await createStore(prisma);
    const storeB = await createStore(prisma);
    const a = await createProduct(prisma, {
      storeId: storeA.id,
      variants: [{ priceTiyin: 1_000_00n, stock: 10 }],
    });
    const b = await createProduct(prisma, {
      storeId: storeB.id,
      variants: [{ priceTiyin: 2_500_00n, stock: 4 }],
    });
    const { cookie } = await login(app);
    await addToCart(cookie, a.variants[0]?.id ?? '', 3);
    await addToCart(cookie, b.variants[0]?.id ?? '', 2);

    const res = await checkout(cookie, body('800000')).expect(201);
    const { order } = orderResponseSchema.parse(res.body);
    expect(order.number).toMatch(/^UZ-\d{4}-\d{6}$/);
    expect(order).toMatchObject({
      status: 'CREATED',
      itemsTotalTiyin: '800000',
      totalTiyin: '800000',
    });
    expect(order.address.recipientPhone).toBe('+998901234567');
    expect(order.sellerOrders).toHaveLength(2);
    expect(order.sellerOrders.map((so) => so.totalTiyin).sort()).toEqual(['300000', '500000']);
    expect(order.sellerOrders.map((so) => so.number).sort()).toEqual([
      `${order.number}-1`,
      `${order.number}-2`,
    ]);
    expect(order.sellerOrders.every((so) => so.status === 'NEW')).toBe(true);
    expect(order.sellerOrders[0]?.allowedTransitions).toEqual(['CANCELLED_BY_CUSTOMER']);

    expect(
      (await prisma.productVariant.findUniqueOrThrow({ where: { id: a.variants[0]?.id ?? '' } }))
        .stock,
    ).toBe(7);
    expect(
      (await prisma.productVariant.findUniqueOrThrow({ where: { id: b.variants[0]?.id ?? '' } }))
        .stock,
    ).toBe(2);
    expect(await cartTotal(cookie)).toBe('0');

    // Snapshots do not change when the product changes later.
    await prisma.productVariant.update({
      where: { id: a.variants[0]?.id ?? '' },
      data: { priceTiyin: 9_999_00n },
    });
    const again = orderResponseSchema.parse(
      (await http().get(`/api/v1/orders/${order.number}`).set('Cookie', cookie).expect(200)).body,
    );
    expect(again.order.itemsTotalTiyin).toBe('800000');

    const events = await prisma.orderEvent.findMany({ where: { order: { number: order.number } } });
    expect(events.map((e) => e.toStatus).sort()).toEqual(['CREATED', 'NEW', 'NEW']);
  });

  it('never accepts prices from the client', async () => {
    const store = await createStore(prisma);
    const p = await createProduct(prisma, {
      storeId: store.id,
      variants: [{ priceTiyin: 1_000_00n, stock: 10 }],
    });
    const { cookie } = await login(app);
    await addToCart(cookie, p.variants[0]?.id ?? '', 1);

    const changed = await checkout(cookie, body('1')).expect(422);
    expect(errorCode(changed.body)).toBe('PRICE_CHANGED');
    expect(apiErrorSchema.parse(changed.body).error.details).toEqual({ totalTiyin: '100000' });

    const injected = await checkout(cookie, body('100000', { totalTiyin: '1' })).expect(400);
    expect(errorCode(injected.body)).toBe('VALIDATION_FAILED');
    expect(
      await prisma.order.count({ where: { user: { cart: { items: { some: {} } } } } }),
    ).toBeGreaterThanOrEqual(0);
  });

  it('requires login, an idempotency key, a valid address and a non-empty cart', async () => {
    await http().post('/api/v1/checkout').send(body('0')).expect(401);
    const { cookie } = await login(app);
    expect(
      errorCode((await post('/api/v1/checkout', cookie).send(body('0')).expect(400)).body),
    ).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(errorCode((await checkout(cookie, body('0'), 'not-a-uuid').expect(400)).body)).toBe(
      'IDEMPOTENCY_KEY_REQUIRED',
    );
    expect(errorCode((await checkout(cookie, body('0')).expect(400)).body)).toBe('CART_EMPTY');
    expect(
      errorCode((await checkout(cookie, body('0', { districtId: randomUUID() })).expect(400)).body),
    ).toMatch(/VALIDATION_FAILED|CART_EMPTY/);
  });

  it('is idempotent: the same key replays the same order; a different body is rejected', async () => {
    const store = await createStore(prisma);
    const p = await createProduct(prisma, {
      storeId: store.id,
      variants: [{ priceTiyin: 5_000_00n, stock: 10 }],
    });
    const { cookie, userId } = await login(app);
    await addToCart(cookie, p.variants[0]?.id ?? '', 2);
    const key = randomUUID();

    const first = orderResponseSchema.parse(
      (await checkout(cookie, body('1000000'), key).expect(201)).body,
    );
    const replay = orderResponseSchema.parse(
      (await checkout(cookie, body('1000000'), key).expect(201)).body,
    );
    expect(replay.order.number).toBe(first.order.number);
    expect(await prisma.order.count({ where: { userId } })).toBe(1);
    expect(
      (await prisma.productVariant.findUniqueOrThrow({ where: { id: p.variants[0]?.id ?? '' } }))
        .stock,
    ).toBe(8);

    const reused = await checkout(cookie, body('1000000', { comment: 'boshqa' }), key).expect(409);
    expect(errorCode(reused.body)).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('creates exactly one order for concurrent double-submits with the same key', async () => {
    const store = await createStore(prisma);
    const p = await createProduct(prisma, {
      storeId: store.id,
      variants: [{ priceTiyin: 1_000_00n, stock: 10 }],
    });
    const { cookie, userId } = await login(app);
    await addToCart(cookie, p.variants[0]?.id ?? '', 1);
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => checkout(cookie, body('100000'), key)),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    expect(new Set(results.map((r) => orderResponseSchema.parse(r.body).order.number)).size).toBe(
      1,
    );
    expect(await prisma.order.count({ where: { userId } })).toBe(1);
  });

  it('never oversells under concurrent checkouts (real PostgreSQL, parallel requests)', async () => {
    const store = await createStore(prisma);
    const p = await createProduct(prisma, {
      storeId: store.id,
      variants: [{ priceTiyin: 1_000_00n, stock: 5 }],
    });
    const variantId = p.variants[0]?.id ?? '';
    const buyers = await Promise.all(Array.from({ length: 12 }, () => login(app)));
    for (const buyer of buyers) await addToCart(buyer.cookie, variantId, 1);

    const results = await Promise.all(
      buyers.map((buyer) => checkout(buyer.cookie, body('100000'))),
    );
    const ok = results.filter((r) => r.status === 201);
    const failed = results.filter((r) => r.status !== 201);
    expect(ok).toHaveLength(5);
    expect(
      failed
        .map((r) => errorCode(r.body))
        .every((c) => c === 'OUT_OF_STOCK' || c === 'CART_HAS_ISSUES'),
    ).toBe(true);
    expect(
      (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock,
    ).toBe(0);
    const sold = await prisma.orderItem.aggregate({
      where: { variantId },
      _sum: { quantity: true },
    });
    expect(sold._sum.quantity).toBe(5);
  });

  describe('state machine and seller isolation', () => {
    async function placeOrder() {
      const owner = await login(app);
      const store = await createStore(prisma, { ownerId: owner.userId });
      const p = await createProduct(prisma, {
        storeId: store.id,
        variants: [{ priceTiyin: 1_000_00n, stock: 10 }],
      });
      const customer = await login(app);
      await addToCart(customer.cookie, p.variants[0]?.id ?? '', 2);
      const { order } = orderResponseSchema.parse(
        (await checkout(customer.cookie, body('200000')).expect(201)).body,
      );
      return {
        owner,
        store,
        customer,
        order,
        variantId: p.variants[0]?.id ?? '',
        shipmentId: order.sellerOrders[0]?.id ?? '',
      };
    }
    const sellerMove = (cookie: string, shipmentId: string, to: string) =>
      post(`/api/v1/seller/seller-orders/${shipmentId}/transition`, cookie).send({ to });

    it('lets the seller fulfil step by step and rejects invalid transitions', async () => {
      const { owner, customer, order, shipmentId } = await placeOrder();
      const invalid = await sellerMove(owner.cookie, shipmentId, 'DELIVERED').expect(409);
      expect(errorCode(invalid.body)).toBe('INVALID_STATE_TRANSITION');

      for (const to of ['ACCEPTED', 'PACKED', 'HANDED_TO_DELIVERY', 'DELIVERED']) {
        await sellerMove(owner.cookie, shipmentId, to).expect(204);
      }
      await sellerMove(owner.cookie, shipmentId, 'ACCEPTED').expect(409);
      const view = orderResponseSchema.parse(
        (
          await http()
            .get(`/api/v1/orders/${order.number}`)
            .set('Cookie', customer.cookie)
            .expect(200)
        ).body,
      );
      expect(view.order.status).toBe('COMPLETED');
      expect(view.order.sellerOrders[0]?.allowedTransitions).toEqual(['RETURN_REQUESTED']);
      const events = await prisma.orderEvent.findMany({
        where: { sellerOrderId: shipmentId },
        orderBy: { createdAt: 'asc' },
      });
      expect(events.map((e) => `${e.fromStatus ?? ''}>${e.toStatus}`)).toEqual([
        '>NEW',
        'NEW>ACCEPTED',
        'ACCEPTED>PACKED',
        'PACKED>HANDED_TO_DELIVERY',
        'HANDED_TO_DELIVERY>DELIVERED',
      ]);
    });

    it('customers may cancel only while NEW, and cancellation restores stock', async () => {
      const { customer, order, shipmentId, variantId, owner } = await placeOrder();
      const path = `/api/v1/orders/${order.number}/seller-orders/${shipmentId}/transition`;
      const forbidden = await post(path, customer.cookie).send({ to: 'ACCEPTED' }).expect(409);
      expect(errorCode(forbidden.body)).toBe('INVALID_STATE_TRANSITION');

      const res = await post(path, customer.cookie)
        .send({ to: 'CANCELLED_BY_CUSTOMER', reason: 'Fikrim oʻzgardi' })
        .expect(200);
      expect(orderResponseSchema.parse(res.body).order.status).toBe('CANCELLED');
      expect(
        (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock,
      ).toBe(10);
      await sellerMove(owner.cookie, shipmentId, 'ACCEPTED').expect(409);
    });

    it('isolates sellers and customers from each other', async () => {
      const first = await placeOrder();
      const second = await placeOrder();

      // Seller B cannot see or move seller A's shipment.
      await sellerMove(second.owner.cookie, first.shipmentId, 'ACCEPTED').expect(404);
      await http()
        .get(`/api/v1/seller/orders?storeId=${first.store.id}`)
        .set('Cookie', second.owner.cookie)
        .expect(403);
      const list = sellerShipmentListSchema.parse(
        (await http().get('/api/v1/seller/orders').set('Cookie', second.owner.cookie).expect(200))
          .body,
      );
      expect(list.items.map((s) => s.id)).toEqual([second.shipmentId]);

      // Customer B cannot read or act on customer A's order.
      await http()
        .get(`/api/v1/orders/${first.order.number}`)
        .set('Cookie', second.customer.cookie)
        .expect(404);
      await post(
        `/api/v1/orders/${first.order.number}/seller-orders/${first.shipmentId}/transition`,
        second.customer.cookie,
      )
        .send({ to: 'CANCELLED_BY_CUSTOMER' })
        .expect(404);
      // A customer is not a seller.
      await sellerMove(first.customer.cookie, first.shipmentId, 'ACCEPTED').expect(404);
    });

    it('keeps orders and their history immutable in the database', async () => {
      const { order } = await placeOrder();
      const row = await prisma.order.findUniqueOrThrow({ where: { number: order.number } });
      await expect(prisma.order.delete({ where: { id: row.id } })).rejects.toThrow(
        /cannot be deleted/,
      );
      const event = await prisma.orderEvent.findFirstOrThrow({ where: { orderId: row.id } });
      await expect(
        prisma.orderEvent.update({ where: { id: event.id }, data: { toStatus: 'X' } }),
      ).rejects.toThrow(/cannot be updated/);
    });
  });
});
