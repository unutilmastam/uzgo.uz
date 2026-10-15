import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  apiErrorSchema,
  courierMeSchema,
  courierOffersSchema,
  foodQuoteSchema,
  orderResponseSchema,
  restaurantListSchema,
  restaurantOrderListSchema,
  storeFinanceSchema,
} from '@uzgo/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FoodOrdersService } from '../src/food/food-orders.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, login, randomIp, TEST_ORIGIN } from './app.js';
import { createRestaurant, retireTestStores, TERMIZ } from './fixtures.js';

const errorCode = (body: unknown) => apiErrorSchema.parse(body).error.code;
/** ~0.5 km from the test restaurant (inside the delivery area). */
const HOME = { lat: 37.2286, lng: 67.2756 };
const TASHKENT = { lat: 41.3111, lng: 69.2797 };

describe('UZGO Food — ordering, restaurant team, couriers (ADR 0024)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const send = (method: 'post' | 'put' | 'patch', path: string, cookie: string, body?: object) => {
    const server = http();
    return server[method](`/api/v1${path}`)
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .set('X-Forwarded-For', randomIp())
      .send(body);
  };
  const get = (path: string, cookie: string) =>
    http().get(`/api/v1${path}`).set('Cookie', cookie).expect(200);

  async function restaurant(options: Parameters<typeof createRestaurant>[1] = {}) {
    const owner = await login(app);
    const r = await createRestaurant(prisma, { ownerId: owner.userId, ...options });
    await prisma.store.update({ where: { id: r.store.id }, data: { commissionBp: 1000 } });
    return { owner, ...r };
  }

  async function courier(at = TERMIZ) {
    const user = await login(app);
    await prisma.courierProfile.create({ data: { userId: user.userId } });
    await prisma.userRole.create({ data: { userId: user.userId, role: 'COURIER' } });
    await send('put', '/courier/status', user.cookie, { online: true, ...at }).expect(200);
    return user;
  }

  const lines = (dishes: { id: string }[], quantity = 1) =>
    dishes.map((d) => ({ menuItemId: d.id, quantity }));

  const quote = async (cookie: string, body: object) =>
    foodQuoteSchema.parse((await send('post', '/food/quote', cookie, body).expect(200)).body);

  async function order(
    customer: { cookie: string },
    restaurantId: string,
    items: { menuItemId: string; quantity: number }[],
    paymentMethod = 'CASH_ON_DELIVERY',
  ) {
    const q = await quote(customer.cookie, { restaurantId, items, ...HOME });
    expect(q.available).toBe(true);
    const res = await http()
      .post('/api/v1/food/checkout')
      .set('Cookie', customer.cookie)
      .set('Origin', TEST_ORIGIN)
      .set('Idempotency-Key', randomUUID())
      .send({
        restaurantId,
        items,
        ...HOME,
        addressLine: 'Alpomish koʻchasi 5, 12-xonadon',
        recipientName: 'Ali Valiyev',
        recipientPhone: '+998901234567',
        paymentMethod,
        expectedTotalTiyin: q.totalTiyin,
      })
      .expect(201);
    const placed = orderResponseSchema.parse(res.body).order;
    if (paymentMethod === 'DEV_ONLINE') {
      await send('post', `/payments/dev/${placed.number}`, customer.cookie, {
        outcome: 'success',
      }).expect(200);
    }
    return { order: placed, shipmentId: placed.sellerOrders[0]?.id ?? '', quote: q };
  }

  const move = (cookie: string, shipmentId: string, to: string) =>
    send('post', `/seller/seller-orders/${shipmentId}/transition`, cookie, { to });

  const balance = async (cookie: string, storeId: string) =>
    storeFinanceSchema.parse((await get(`/seller/stores/${storeId}/finance`, cookie)).body)
      .balanceTiyin;

  beforeAll(async () => {
    app = await createTestApp({ env: { DEV_PAYMENTS_ENABLED: 'true', PAYOUT_HOLD_DAYS: '0' } });
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // Test couriers go offline so later runs on the same database start clean.
    await prisma.courierProfile.updateMany({ where: { online: true }, data: { online: false } });
    await retireTestStores(prisma);
    await app.close();
  });

  it('lists nearby restaurants and explains why a basket cannot be ordered', async () => {
    const r = await restaurant({
      deliveryMode: 'SELF',
      selfDeliveryFeeTiyin: 500_000n,
      minOrderTiyin: 4_000_000n,
      dishes: [{ priceTiyin: 3_000_000n }, { priceTiyin: 1_500_000n, available: false }],
    });
    const customer = await login(app);
    const list = restaurantListSchema.parse(
      (await http().get(`/api/v1/food/restaurants?lat=${String(HOME.lat)}&lng=${String(HOME.lng)}`))
        .body,
    );
    const mine = list.items.find((i) => i.id === r.store.id);
    expect(mine).toMatchObject({ deliversHere: true, deliveryFeeTiyin: '500000', openNow: true });
    expect(mine?.distanceM).toBeGreaterThan(300);

    const dish = r.dishes[0] ?? { id: '' };
    const soldOut = r.dishes[1] ?? { id: '' };
    const base = { restaurantId: r.store.id, ...HOME };
    expect(await quote(customer.cookie, { ...base, items: lines([dish]) })).toMatchObject({
      available: false,
      reason: 'MIN_ORDER',
      itemsTotalTiyin: '3000000',
    });
    expect((await quote(customer.cookie, { ...base, items: lines([dish, soldOut]) })).reason).toBe(
      'ITEM_UNAVAILABLE',
    );
    expect(
      (await quote(customer.cookie, { ...base, ...TASHKENT, items: lines([dish], 2) })).reason,
    ).toBe('OUT_OF_AREA');
    const ok = await quote(customer.cookie, { ...base, items: lines([dish], 2) });
    expect(ok).toMatchObject({
      available: true,
      itemsTotalTiyin: '6000000',
      deliveryTiyin: '500000',
      totalTiyin: '6500000',
    });

    // The team pauses intake: quotes and checkout refuse.
    await send('patch', `/restaurant/${r.store.id}/settings`, r.owner.cookie, {
      acceptingOrders: false,
    }).expect(204);
    expect((await quote(customer.cookie, { ...base, items: lines([dish], 2) })).reason).toBe(
      'PAUSED',
    );
    const refused = await http()
      .post('/api/v1/food/checkout')
      .set('Cookie', customer.cookie)
      .set('Origin', TEST_ORIGIN)
      .set('Idempotency-Key', randomUUID())
      .send({
        ...base,
        items: lines([dish], 2),
        addressLine: 'Alpomish 5',
        recipientName: 'Ali Valiyev',
        recipientPhone: '+998901234567',
        paymentMethod: 'CASH_ON_DELIVERY',
        expectedTotalTiyin: '6500000',
      })
      .expect(409);
    expect(apiErrorSchema.parse(refused.body).error).toMatchObject({
      code: 'FOOD_UNAVAILABLE',
      details: { reason: 'PAUSED' },
    });
    // Someone else's restaurant cannot be paused.
    await send('patch', `/restaurant/${r.store.id}/settings`, customer.cookie, {
      acceptingOrders: true,
    }).expect(404);

    // Closed by its hours (open only on another weekday).
    const tomorrow = (new Date(Date.now() + 5 * 3_600_000).getUTCDay() + 6 + 2) % 7;
    const closed = await restaurant({
      openingHours: [{ day: tomorrow, open: '10:00', close: '11:00' }],
    });
    expect(
      (
        await quote(customer.cookie, {
          restaurantId: closed.store.id,
          ...HOME,
          items: lines(closed.dishes),
        })
      ).reason,
    ).toBe('CLOSED');
  });

  it('restaurant delivers itself: cooking → ready → on the way → delivered, cash', async () => {
    const r = await restaurant({ deliveryMode: 'SELF', selfDeliveryFeeTiyin: 500_000n });
    const customer = await login(app);
    const { order: placed, shipmentId } = await order(customer, r.store.id, lines(r.dishes, 2));
    expect(placed).toMatchObject({
      kind: 'FOOD',
      itemsTotalTiyin: '6000000',
      deliveryTotalTiyin: '500000',
      totalTiyin: '6500000',
      food: { deliveryMode: 'SELF', courier: null, destination: HOME },
    });
    expect(placed.food?.etaAt).not.toBeNull();
    expect(placed.sellerOrders[0]?.allowedTransitions).toEqual(['CANCELLED_BY_CUSTOMER']);

    const team = restaurantOrderListSchema.parse(
      (await get(`/restaurant/${r.store.id}/orders`, r.owner.cookie)).body,
    ).items;
    expect(team[0]).toMatchObject({
      orderNumber: placed.number,
      status: 'NEW',
      collectTiyin: '6500000',
      addressLine: 'Alpomish koʻchasi 5, 12-xonadon',
      allowedTransitions: ['ACCEPTED', 'CANCELLED_BY_SELLER'],
    });
    expect(team[0]?.acceptBy).not.toBeNull();
    // Food orders stay out of the marketplace shipment list.
    const market = await get(`/seller/orders?storeId=${r.store.id}`, r.owner.cookie);
    expect((market.body as { items: unknown[] }).items).toHaveLength(0);
    // New food orders reach the restaurant team.
    expect(
      await prisma.notification.count({
        where: {
          orderId: (await prisma.order.findUniqueOrThrow({ where: { number: placed.number } })).id,
          template: 'seller.new_order',
        },
      }),
    ).toBeGreaterThan(0);

    for (const to of ['ACCEPTED', 'PACKED', 'HANDED_TO_DELIVERY', 'DELIVERED']) {
      await move(r.owner.cookie, shipmentId, to).expect(204);
    }
    const done = orderResponseSchema.parse(
      (await get(`/orders/${placed.number}`, customer.cookie)).body,
    ).order;
    expect(done.status).toBe('COMPLETED');
    // No returns for food.
    expect(done.sellerOrders[0]?.allowedTransitions).toEqual([]);
    // Cash: the restaurant collected 65 000 and owes the 10 % commission on dishes.
    expect(await balance(r.owner.cookie, r.store.id)).toBe('-600000');
  });

  it('UZGO courier: offers nearby, one courier wins, picks up when ready, delivers (online)', async () => {
    const r = await restaurant({ deliveryMode: 'UZGO' });
    const customer = await login(app);
    const near = await courier({ lat: 37.226, lng: 67.279 });
    const other = await courier({ lat: 37.227, lng: 67.28 });
    const far = await courier(TASHKENT);
    const {
      order: placed,
      shipmentId,
      quote: q,
    } = await order(customer, r.store.id, lines(r.dishes), 'DEV_ONLINE');
    const fee = BigInt(q.deliveryTiyin);
    expect(fee).toBeGreaterThan(0n);
    expect(fee % 10_000n).toBe(0n);

    // Not an offer before the kitchen accepts it.
    const offers = async (cookie: string) =>
      courierOffersSchema.parse((await get('/courier/offers', cookie)).body).items;
    expect((await offers(near.cookie)).some((o) => o.id === shipmentId)).toBe(false);
    for (const c of [near, far]) {
      await send('put', '/push-devices', c.cookie, {
        token: `ExponentPushToken[courier-${randomUUID().slice(0, 12)}]`,
        platform: 'ANDROID',
      }).expect(204);
    }
    await move(r.owner.cookie, shipmentId, 'ACCEPTED').expect(204);
    const offer = (await offers(near.cookie)).find((o) => o.id === shipmentId);
    expect(offer).toMatchObject({ customer: null, feeTiyin: fee.toString(), collectTiyin: null });
    expect((await offers(far.cookie)).some((o) => o.id === shipmentId)).toBe(false);
    // Nearby couriers with the app get a push (no personal data); far ones do not.
    const orderId = (await prisma.order.findUniqueOrThrow({ where: { number: placed.number } })).id;
    const pushes = await prisma.notification.findMany({
      where: { orderId, template: 'courier.offer' },
    });
    const recipients = pushes.map((p) => p.recipient);
    expect(recipients).toContain(near.userId);
    expect(recipients).not.toContain(far.userId);
    expect(pushes.every((p) => JSON.stringify(p.data) === '{"type":"courier"}')).toBe(true);

    // A customer or a non-courier cannot use courier routes.
    await http().get('/api/v1/courier/offers').set('Cookie', customer.cookie).expect(403);

    const race = await Promise.all(
      [near, other].map((c) => send('post', `/courier/offers/${shipmentId}/accept`, c.cookie)),
    );
    expect(race.map((x) => x.status).sort()).toEqual([200, 409]);
    const winner = race[0]?.status === 200 ? near : other;
    const loser = winner === near ? other : near;
    expect(errorCode(race.find((x) => x.status === 409)?.body)).toBe('OFFER_TAKEN');

    const mine = courierMeSchema.parse((await get('/courier/me', winner.cookie)).body);
    expect(mine.active[0]).toMatchObject({
      id: shipmentId,
      customer: { phone: '+998901234567', addressLine: 'Alpomish koʻchasi 5, 12-xonadon' },
      allowedTransitions: [],
    });
    // The restaurant cannot hand UZGO orders over itself; the courier waits until ready.
    await move(r.owner.cookie, shipmentId, 'PACKED').expect(204);
    await move(r.owner.cookie, shipmentId, 'HANDED_TO_DELIVERY').expect(409);
    await send('post', `/courier/orders/${shipmentId}/transition`, loser.cookie, {
      to: 'HANDED_TO_DELIVERY',
    }).expect(404);
    await send('post', `/courier/orders/${shipmentId}/transition`, winner.cookie, {
      to: 'HANDED_TO_DELIVERY',
    }).expect(200);

    // The customer sees the courier and their last position while on the way.
    await send('put', '/courier/location', winner.cookie, { lat: 37.2275, lng: 67.277 }).expect(
      204,
    );
    const tracking = orderResponseSchema.parse(
      (await get(`/orders/${placed.number}`, customer.cookie)).body,
    ).order.food;
    expect(tracking?.courier).toMatchObject({
      phone: (await prisma.user.findUniqueOrThrow({ where: { id: winner.userId } })).phone,
      position: { lat: 37.2275, lng: 67.277 },
    });

    await send('post', `/courier/orders/${shipmentId}/transition`, winner.cookie, {
      to: 'DELIVERED',
    }).expect(200);
    // Ledger: restaurant 30 000 − 10 %, courier the whole fee, journals balanced.
    expect(await balance(r.owner.cookie, r.store.id)).toBe('2700000');
    const me = courierMeSchema.parse((await get('/courier/me', winner.cookie)).body);
    expect(me).toMatchObject({ balanceTiyin: fee.toString(), active: [] });
    const entries = await prisma.ledgerEntry.findMany({ where: { sellerOrderId: shipmentId } });
    expect(entries.reduce((s, e) => s + e.amountTiyin, 0n)).toBe(0n);
  });

  it('UZGO courier with cash: the courier owes UZGO the dishes and keeps the fee', async () => {
    const r = await restaurant({ deliveryMode: 'UZGO' });
    const customer = await login(app);
    const c = await courier({ lat: 37.226, lng: 67.279 });
    const { shipmentId, quote: q } = await order(customer, r.store.id, lines(r.dishes, 3));
    await move(r.owner.cookie, shipmentId, 'ACCEPTED').expect(204);
    await send('post', `/courier/offers/${shipmentId}/accept`, c.cookie).expect(200);
    const job = courierMeSchema.parse((await get('/courier/me', c.cookie)).body).active[0];
    expect(job?.collectTiyin).toBe(q.totalTiyin);
    await move(r.owner.cookie, shipmentId, 'PACKED').expect(204);
    for (const to of ['HANDED_TO_DELIVERY', 'DELIVERED']) {
      await send('post', `/courier/orders/${shipmentId}/transition`, c.cookie, { to }).expect(200);
    }
    expect(courierMeSchema.parse((await get('/courier/me', c.cookie)).body).balanceTiyin).toBe(
      '-9000000',
    );
    expect(await balance(r.owner.cookie, r.store.id)).toBe('8100000');
  });

  it('cancels orders the restaurant did not accept in time and refunds online payments', async () => {
    const r = await restaurant({ deliveryMode: 'SELF' });
    const customer = await login(app);
    const { order: placed, shipmentId } = await order(
      customer,
      r.store.id,
      lines(r.dishes),
      'DEV_ONLINE',
    );
    const food = app.get(FoodOrdersService);
    const status = async () =>
      (await prisma.sellerOrder.findUniqueOrThrow({ where: { id: shipmentId } })).status;
    await food.cancelUnaccepted(new Date(Date.now() + 60_000));
    expect(await status()).toBe('NEW');
    expect(await food.cancelUnaccepted(new Date(Date.now() + 11 * 60_000))).toBeGreaterThan(0);
    const after = orderResponseSchema.parse(
      (await get(`/orders/${placed.number}`, customer.cookie)).body,
    ).order;
    expect(after.sellerOrders[0]?.status).toBe('CANCELLED_BY_SELLER');
    const refund = await prisma.refund.findFirstOrThrow({ where: { sellerOrderId: shipmentId } });
    expect(refund.amountTiyin).toBe(BigInt(placed.totalTiyin));
  });
});
