import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  cartResponseSchema,
  mobileLoginResponseSchema,
  orderResponseSchema,
} from '@uzgo/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NotificationsService } from '../src/notifications/notifications.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { type FakePushProvider, PUSH_PROVIDER } from '../src/push/push.provider.js';
import {
  createTestApp,
  fakeSms,
  login,
  newSession,
  randomIp,
  randomPhone,
  TEST_ORIGIN,
} from './app.js';
import { createProduct, createStore, retireTestStores } from './fixtures.js';

const MOBILE = { 'X-UZGO-Client': 'mobile' };

describe('mobile app protocol (ADR 0022)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let districtId = '';
  const http = () => request(app.getHttpServer());

  /** OTP login as the app does it; returns the bearer token. */
  async function mobileLogin(phone = randomPhone(), cartToken?: string) {
    const ip = randomIp();
    await http()
      .post('/api/v1/auth/otp/request')
      .set(MOBILE)
      .set('X-Forwarded-For', ip)
      .send({ phone })
      .expect(200);
    const res = await http()
      .post('/api/v1/auth/otp/verify')
      .set(MOBILE)
      .set('X-Forwarded-For', ip)
      .set(cartToken ? { 'X-Cart-Token': cartToken } : {})
      .send({ phone, code: fakeSms(app).lastCodeFor(phone) })
      .expect(200);
    expect(res.headers['set-cookie']).toBeUndefined();
    const body = mobileLoginResponseSchema.parse(res.body);
    return { token: body.session.token, userId: body.user.id, phone };
  }

  const bearer = (token: string) => ({ ...MOBILE, Authorization: `Bearer ${token}` });

  async function product(stock = 10) {
    const owner = await login(app);
    const store = await createStore(prisma, { ownerId: owner.userId });
    const p = await createProduct(prisma, {
      storeId: store.id,
      variants: [{ priceTiyin: 1_500_00n, stock }],
    });
    return { owner, store, variantId: p.variants[0]?.id ?? '' };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    districtId = (await prisma.district.findUniqueOrThrow({ where: { slug: 'termiz_city' } })).id;
  });

  afterAll(async () => {
    await retireTestStores(prisma);
    await app.close();
  });

  it('logs in with a bearer token instead of cookies and logs out', async () => {
    const { token, userId } = await mobileLogin();
    const me = await http().get('/api/v1/auth/me').set(bearer(token)).expect(200);
    expect((me.body as { user: { id: string } }).user.id).toBe(userId);

    await http()
      .get('/api/v1/auth/me')
      .set(bearer('x'.repeat(43)))
      .expect(401);
    await http()
      .get('/api/v1/auth/me')
      .set({ Authorization: `Basic ${token}` })
      .expect(401);

    // State-changing calls work without Origin: a bearer token is never sent by a browser on its own.
    await http()
      .patch('/api/v1/users/me')
      .set(bearer(token))
      .send({ firstName: 'Ali' })
      .expect(200);

    await http().post('/api/v1/auth/logout').set(bearer(token)).expect(204);
    await http().get('/api/v1/auth/me').set(bearer(token)).expect(401);
  });

  it('keeps a guest cart in a header token and merges it at login', async () => {
    const { variantId } = await product();
    const add = await http()
      .post('/api/v1/cart/items')
      .set(MOBILE)
      .send({ variantId, quantity: 2 })
      .expect(201);
    expect(add.headers['set-cookie']).toBeUndefined();
    const cartToken = add.headers['x-cart-token'] as string;
    expect(cartToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const units = (body: unknown) => cartResponseSchema.parse(body).cart.itemCount;
    const cart = await http().get('/api/v1/cart').set(MOBILE).set('X-Cart-Token', cartToken);
    expect(units(cart.body)).toBe(2);
    // Browsers cannot use the header: without the mobile marker it is ignored.
    const browser = await http().get('/api/v1/cart').set('X-Cart-Token', cartToken);
    expect(units(browser.body)).toBe(0);

    const { token } = await mobileLogin(randomPhone(), cartToken);
    const mine = await http().get('/api/v1/cart').set(bearer(token)).expect(200);
    expect(units(mine.body)).toBe(2);
  });

  it('registers push devices per session and pushes order events to phones', async () => {
    const push = app.get<FakePushProvider>(PUSH_PROVIDER);
    const notifications = app.get(NotificationsService);
    const { owner, store, variantId } = await product();
    // The seller's phone: a second session of the same account (no OTP cooldown).
    const sellerPhone = {
      token: (await newSession(app, owner.userId)).split('=')[1] ?? '',
    };
    const sellerToken = `ExponentPushToken[seller-${randomUUID().slice(0, 12)}]`;
    await http()
      .put('/api/v1/push-devices')
      .set(bearer(sellerPhone.token))
      .send({ token: sellerToken, platform: 'ANDROID' })
      .expect(204);
    await http()
      .put('/api/v1/push-devices')
      .set(MOBILE)
      .send({ token: sellerToken, platform: 'ANDROID' })
      .expect(401);
    await http()
      .put('/api/v1/push-devices')
      .set(bearer(sellerPhone.token))
      .send({ token: 'not-a-token', platform: 'ANDROID' })
      .expect(400);

    const customer = await mobileLogin();
    const customerToken = `ExponentPushToken[buyer-${randomUUID().slice(0, 12)}]`;
    await http()
      .put('/api/v1/push-devices')
      .set(bearer(customer.token))
      .send({ token: customerToken, platform: 'IOS' })
      .expect(204);

    await http()
      .post('/api/v1/cart/items')
      .set(bearer(customer.token))
      .send({ variantId, quantity: 1 })
      .expect(201);
    const res = await http()
      .post('/api/v1/checkout')
      .set(bearer(customer.token))
      .set('Idempotency-Key', randomUUID())
      .send({
        recipientName: 'Ali Valiyev',
        recipientPhone: '+998901234567',
        districtId,
        addressLine: 'Alpomish koʻchasi, 1',
        paymentMethod: 'CASH_ON_DELIVERY',
        expectedTotalTiyin: '150000',
      })
      .expect(201);
    const { order } = orderResponseSchema.parse(res.body);
    const orderId = (await prisma.order.findUniqueOrThrow({ where: { number: order.number } })).id;

    const sellerPush = await prisma.notification.findFirstOrThrow({
      where: { orderId, channel: 'PUSH', template: 'seller.new_order' },
    });
    expect(sellerPush.recipient).toBe(owner.userId);
    expect(sellerPush.data).toEqual({ type: 'shipment', storeId: store.id });
    await notifications.dispatchDue(new Date(), [sellerPush.id]);
    const sent = push.sent.find((m) => m.to === sellerToken);
    expect(sent).toMatchObject({ title: 'UZGO', data: { type: 'shipment', storeId: store.id } });
    expect(sent?.body).not.toContain('Alpomish');

    // The seller accepts in the app; the customer's phone hears about it.
    const shipmentId = order.sellerOrders[0]?.id ?? '';
    await http()
      .post(`/api/v1/seller/seller-orders/${shipmentId}/transition`)
      .set(bearer(sellerPhone.token))
      .send({ to: 'ACCEPTED' })
      .expect(204);
    const accepted = await prisma.notification.findFirstOrThrow({
      where: { orderId, channel: 'PUSH', template: 'shipment.accepted' },
    });
    expect(accepted).toMatchObject({
      recipient: customer.userId,
      data: { type: 'order', number: order.number },
    });

    // A phone the provider reports as gone is forgotten; nobody else is retried.
    push.gone.add(customerToken);
    await notifications.dispatchDue(new Date(), [accepted.id]);
    expect(await prisma.pushDevice.count({ where: { token: customerToken } })).toBe(0);
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: accepted.id } })).status,
    ).toBe('SENT');

    // A token re-registered by another account is re-bound to it.
    const other = await mobileLogin();
    await http()
      .put('/api/v1/push-devices')
      .set(bearer(other.token))
      .send({ token: sellerToken, platform: 'ANDROID' })
      .expect(204);
    expect(
      (await prisma.pushDevice.findUniqueOrThrow({ where: { token: sellerToken } })).userId,
    ).toBe(other.userId);
    // Unregistering someone else's token does nothing.
    await http()
      .post('/api/v1/push-devices/unregister')
      .set(bearer(sellerPhone.token))
      .send({ token: sellerToken })
      .expect(204);
    expect(await prisma.pushDevice.count({ where: { token: sellerToken } })).toBe(1);
    // Logging out removes the phone.
    await http().post('/api/v1/auth/logout').set(bearer(other.token)).expect(204);
    expect(await prisma.pushDevice.count({ where: { token: sellerToken } })).toBe(0);
  });

  it('keeps browsers on cookies and CSRF rules', async () => {
    const { cookie } = await login(app);
    // A browser session cookie without Origin is still refused for writes.
    await http()
      .patch('/api/v1/users/me')
      .set('Cookie', cookie)
      .send({ firstName: 'Ali' })
      .expect(403);
    await http()
      .patch('/api/v1/users/me')
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .send({ firstName: 'Ali' })
      .expect(200);
  });
});
