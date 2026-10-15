import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  apiErrorSchema,
  deliveryQuoteSchema,
  orderResponseSchema,
  pickupPointsResponseSchema,
} from '@uzgo/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FakeTelegramProvider } from '../src/notifications/telegram.provider.js';
import { TELEGRAM_PROVIDER } from '../src/notifications/telegram.provider.js';
import { NotificationsService } from '../src/notifications/notifications.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { SMS_PROVIDER } from '../src/sms/sms.provider.js';
import type { FakeSmsProvider } from '../src/sms/fake-sms.provider.js';
import { createTestApp, login, loginStaff, randomIp, TEST_ORIGIN } from './app.js';
import { createProduct, createStore, retireTestStores } from './fixtures.js';

const errorCode = (body: unknown) => apiErrorSchema.parse(body).error.code;

/**
 * Uses districts of Navoiy region only: other test files order to Termiz and
 * must not see these tariffs (tests share one database).
 */
describe('delivery tariffs, pickup points, tracking and notifications', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: Awaited<ReturnType<typeof loginStaff>>;
  let zoned = '';
  let closed = '';
  const http = () => request(app.getHttpServer());
  const send = (method: 'post' | 'put' | 'patch', path: string, cookie: string, body?: object) => {
    const server = http();
    return server[method](`/api/v1${path}`)
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .set('X-Forwarded-For', randomIp())
      .send(body);
  };

  /** Two stores; the customer buys 1 × 300 000 soʻm from A and 1 × 50 000 soʻm from B. */
  async function cartWithTwoStores() {
    const ownerA = await login(app);
    const storeA = await createStore(prisma, { ownerId: ownerA.userId });
    const storeB = await createStore(prisma);
    const a = await createProduct(prisma, {
      storeId: storeA.id,
      variants: [{ priceTiyin: 300_000_00n, stock: 5 }],
    });
    const b = await createProduct(prisma, {
      storeId: storeB.id,
      variants: [{ priceTiyin: 50_000_00n, stock: 5 }],
    });
    const customer = await login(app);
    for (const product of [a, b]) {
      await send('post', '/cart/items', customer.cookie, {
        variantId: product.variants[0]?.id,
        quantity: 1,
      }).expect(201);
    }
    return { customer, ownerA, storeA, storeB };
  }

  const quote = async (cookie: string, query: string) =>
    deliveryQuoteSchema.parse(
      (await http().get(`/api/v1/delivery/quote?${query}`).set('Cookie', cookie).expect(200)).body,
    );

  const checkout = (cookie: string, body: Record<string, unknown>) =>
    http()
      .post('/api/v1/checkout')
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .set('Idempotency-Key', randomUUID())
      .send({
        recipientName: 'Ali Valiyev',
        recipientPhone: '+998901234567',
        paymentMethod: 'CASH_ON_DELIVERY',
        ...body,
      });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await loginStaff(app, 'ADMIN');
    const districts = await prisma.district.findMany({
      where: { region: { code: 'UZ-NW' } },
      orderBy: { sort: 'asc' },
      take: 2,
    });
    zoned = districts[0]?.id ?? '';
    closed = districts[1]?.id ?? '';
    // 15 000 soʻm per shipment, free from 200 000 soʻm, 1–3 days.
    await send('put', `/admin/delivery/zones/${zoned}`, admin.cookie, {
      feeTiyin: '1500000',
      freeFromTiyin: '20000000',
      etaDaysMin: 1,
      etaDaysMax: 3,
      active: true,
    }).expect(200);
    await send('put', `/admin/delivery/zones/${closed}`, admin.cookie, {
      feeTiyin: '1000000',
      freeFromTiyin: null,
      etaDaysMin: 2,
      etaDaysMax: 5,
      active: false,
    }).expect(200);
  });

  afterAll(async () => {
    await retireTestStores(prisma);
    await app.close();
  });

  it('prices courier delivery per shipment, with the free threshold', async () => {
    const { customer, storeA, storeB } = await cartWithTwoStores();
    const q = await quote(customer.cookie, `districtId=${zoned}`);
    expect(q).toMatchObject({
      available: true,
      etaDays: { min: 1, max: 3 },
      itemsTotalTiyin: '35000000',
      deliveryTotalTiyin: '1500000',
      totalTiyin: '36500000',
    });
    expect(q.shipments.find((s) => s.storeId === storeA.id)?.deliveryTiyin).toBe('0');
    expect(q.shipments.find((s) => s.storeId === storeB.id)?.deliveryTiyin).toBe('1500000');

    // The server total includes delivery; an outdated total is refused.
    const stale = await checkout(customer.cookie, {
      districtId: zoned,
      addressLine: 'Navoiy koʻchasi, 5',
      expectedTotalTiyin: '35000000',
    }).expect(422);
    expect(errorCode(stale.body)).toBe('PRICE_CHANGED');
    const res = await checkout(customer.cookie, {
      districtId: zoned,
      addressLine: 'Navoiy koʻchasi, 5',
      expectedTotalTiyin: q.totalTiyin,
    }).expect(201);
    const { order } = orderResponseSchema.parse(res.body);
    expect(order.deliveryTotalTiyin).toBe('1500000');
    expect(order.deliveryType).toBe('COURIER');
    const shipmentB = order.sellerOrders.find((s) => s.store.id === storeB.id);
    expect(shipmentB).toMatchObject({ deliveryTiyin: '1500000', totalTiyin: '6500000' });
  });

  it('refuses courier delivery where the zone is switched off', async () => {
    const { customer } = await cartWithTwoStores();
    expect((await quote(customer.cookie, `districtId=${closed}`)).available).toBe(false);
    const res = await checkout(customer.cookie, {
      districtId: closed,
      addressLine: 'Navoiy koʻchasi, 5',
      expectedTotalTiyin: '35000000',
    }).expect(409);
    expect(errorCode(res.body)).toBe('DELIVERY_UNAVAILABLE');
  });

  it('pickup points: free, must be active and in the chosen district', async () => {
    const created = await send('post', '/admin/delivery/pickup-points', admin.cookie, {
      districtId: zoned,
      name: { uz: 'UZGO punkti', ru: 'Пункт UZGO' },
      address: 'Navoiy shahri, Mustaqillik koʻchasi, 1',
      hours: '09:00–20:00',
      phone: null,
      active: true,
    }).expect(201);
    const pointId = (created.body as { point: { id: string } }).point.id;
    const list = pickupPointsResponseSchema.parse(
      (await http().get(`/api/v1/delivery/pickup-points?districtId=${zoned}`).expect(200)).body,
    );
    expect(list.items.map((p) => p.id)).toContain(pointId);

    const { customer } = await cartWithTwoStores();
    const q = await quote(
      customer.cookie,
      `districtId=${zoned}&type=PICKUP&pickupPointId=${pointId}`,
    );
    expect(q.deliveryTotalTiyin).toBe('0');
    await checkout(customer.cookie, {
      districtId: zoned,
      deliveryType: 'PICKUP',
      expectedTotalTiyin: q.totalTiyin,
    }).expect(400);
    const wrongDistrict = await checkout(customer.cookie, {
      districtId: closed,
      deliveryType: 'PICKUP',
      pickupPointId: pointId,
      expectedTotalTiyin: q.totalTiyin,
    }).expect(409);
    expect(errorCode(wrongDistrict.body)).toBe('DELIVERY_UNAVAILABLE');
    const res = await checkout(customer.cookie, {
      districtId: zoned,
      deliveryType: 'PICKUP',
      pickupPointId: pointId,
      expectedTotalTiyin: q.totalTiyin,
    }).expect(201);
    const { order } = orderResponseSchema.parse(res.body);
    expect(order.deliveryType).toBe('PICKUP');
    expect(order.pickupPoint).toMatchObject({ name: { uz: 'UZGO punkti' }, hours: '09:00–20:00' });
    expect(order.address.line).toBe('Navoiy shahri, Mustaqillik koʻchasi, 1');

    // A closed point disappears from the list and cannot be chosen.
    await send('patch', `/admin/delivery/pickup-points/${pointId}`, admin.cookie, {
      active: false,
    }).expect(200);
    const after = pickupPointsResponseSchema.parse(
      (await http().get(`/api/v1/delivery/pickup-points?districtId=${zoned}`).expect(200)).body,
    );
    expect(after.items.map((p) => p.id)).not.toContain(pointId);
  });

  it('delivery settings are admin-only', async () => {
    const moderator = await loginStaff(app, 'MODERATOR');
    await send('put', `/admin/delivery/zones/${zoned}`, moderator.cookie, {
      feeTiyin: '0',
      freeFromTiyin: null,
      etaDaysMin: 0,
      etaDaysMax: 0,
      active: true,
    }).expect(403);
    await send('put', `/admin/delivery/zones/${zoned}`, admin.cookie, {
      feeTiyin: '1',
      freeFromTiyin: null,
      etaDaysMin: 3,
      etaDaysMax: 1,
      active: true,
    }).expect(400);
  });

  it('tracking and status history reach the customer; notifications go through the outbox', async () => {
    const { customer, ownerA, storeA } = await cartWithTwoStores();
    // The owner connects the store's Telegram chat (owner only, validated).
    const staff = await login(app);
    await prisma.storeMember.create({
      data: { storeId: storeA.id, userId: staff.userId, role: 'STAFF' },
    });
    await send('put', `/seller/stores/${storeA.id}/notifications`, staff.cookie, {
      telegramChatId: '12345',
    }).expect(403);
    await send('put', `/seller/stores/${storeA.id}/notifications`, ownerA.cookie, {
      telegramChatId: 'abc',
    }).expect(400);
    await send('put', `/seller/stores/${storeA.id}/notifications`, ownerA.cookie, {
      telegramChatId: '-100123456',
    }).expect(204);

    const q = await quote(customer.cookie, `districtId=${zoned}`);
    const res = await checkout(customer.cookie, {
      districtId: zoned,
      addressLine: 'Navoiy koʻchasi, 5',
      expectedTotalTiyin: q.totalTiyin,
    }).expect(201);
    const { order } = orderResponseSchema.parse(res.body);
    const shipment = order.sellerOrders.find((s) => s.store.id === storeA.id);
    const shipmentId = shipment?.id ?? '';
    const orderId = (await prisma.order.findUniqueOrThrow({ where: { number: order.number } })).id;

    // New-order notices are queued in the checkout transaction.
    const queued = await prisma.notification.findMany({
      where: { orderId, template: 'seller.new_order' },
    });
    // Store A: its owner by SMS and its Telegram chat (store B has no owner here).
    expect(queued.map((n) => n.channel).sort()).toEqual(['SMS', 'TELEGRAM']);
    expect(queued.some((n) => n.channel === 'TELEGRAM' && n.recipient === '-100123456')).toBe(true);
    expect(queued.some((n) => n.channel === 'SMS' && n.recipient === ownerA.phone)).toBe(true);

    // Tracking only once the seller has accepted; strangers get 404.
    await send('patch', `/seller/seller-orders/${shipmentId}/tracking`, ownerA.cookie, {
      carrier: 'BTS',
      trackingCode: 'BTS-123456',
    }).expect(409);
    await send('post', `/seller/seller-orders/${shipmentId}/transition`, ownerA.cookie, {
      to: 'ACCEPTED',
    }).expect(204);
    const stranger = await login(app);
    await send('patch', `/seller/seller-orders/${shipmentId}/tracking`, stranger.cookie, {
      carrier: 'BTS',
      trackingCode: 'BTS-123456',
    }).expect(404);
    await send('patch', `/seller/seller-orders/${shipmentId}/tracking`, ownerA.cookie, {
      carrier: 'BTS',
      trackingCode: 'BTS-123456',
    }).expect(200);

    const view = orderResponseSchema.parse(
      (
        await http()
          .get(`/api/v1/orders/${order.number}`)
          .set('Cookie', customer.cookie)
          .expect(200)
      ).body,
    ).order;
    const mine = view.sellerOrders.find((s) => s.id === shipmentId);
    expect(mine?.tracking).toEqual({ carrier: 'BTS', code: 'BTS-123456' });
    expect(mine?.timeline.map((t) => t.status)).toEqual(['NEW', 'ACCEPTED']);

    // The customer is told about the acceptance.
    const accepted = await prisma.notification.findFirstOrThrow({
      where: { orderId, template: 'shipment.accepted' },
    });
    expect(accepted).toMatchObject({
      channel: 'SMS',
      recipient: customer.phone,
      status: 'PENDING',
    });
    expect(accepted.text).not.toContain('Navoiy'); // no address in messages

    // Sending: a Telegram outage is retried later, SMS goes out.
    const telegram = app.get<FakeTelegramProvider>(TELEGRAM_PROVIDER);
    const sms = app.get<FakeSmsProvider>(SMS_PROVIDER);
    telegram.failNext = 1;
    const notifications = app.get(NotificationsService);
    // Only this order's messages: the test database is shared with other suites.
    const ours = (
      await prisma.notification.findMany({
        where: { orderId, channel: 'TELEGRAM' },
        select: { id: true },
      })
    ).map((n) => n.id);
    const customerSms = await prisma.notification.findMany({
      where: { orderId, recipient: customer.phone },
      select: { id: true },
    });
    await notifications.dispatchDue(new Date(), ours);
    await notifications.dispatchDue(
      new Date(),
      customerSms.map((n) => n.id),
    );
    const tg = await prisma.notification.findFirstOrThrow({
      where: { orderId, channel: 'TELEGRAM' },
    });
    expect(tg).toMatchObject({ status: 'PENDING', attempts: 1 });
    expect(tg.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(
      sms.sent.some((m) => m.phone === customer.phone && m.text.includes(shipment?.number ?? '?')),
    ).toBe(true);

    await notifications.dispatchDue(new Date(Date.now() + 2 * 60_000), ours);
    expect((await prisma.notification.findFirstOrThrow({ where: { id: tg.id } })).status).toBe(
      'SENT',
    );
    expect(telegram.sent.some((m) => m.chatId === '-100123456')).toBe(true);

    // After every retry fails the message is marked FAILED (nothing loops forever).
    const doomed = await prisma.notification.create({
      data: { channel: 'TELEGRAM', recipient: '777', text: 'test', template: 'test' },
    });
    telegram.failNext = 10;
    let at = Date.now();
    for (let i = 0; i < 6; i += 1) {
      await notifications.dispatchDue(new Date(at), [doomed.id]);
      at += 7 * 60 * 60_000;
    }
    telegram.failNext = 0;
    expect(await prisma.notification.findUniqueOrThrow({ where: { id: doomed.id } })).toMatchObject(
      {
        status: 'FAILED',
        attempts: 5,
      },
    );
  });
});
