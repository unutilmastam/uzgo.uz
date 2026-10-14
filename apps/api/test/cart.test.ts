import type { NestExpressApplication } from '@nestjs/platform-express';
import { apiErrorSchema, cartResponseSchema } from '@uzgo/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, fakeSms, randomIp, randomPhone, TEST_ORIGIN } from './app.js';
import { createProduct, createStore, retireTestStores } from './fixtures.js';

const errorCode = (body: unknown) => apiErrorSchema.parse(body).error.code;
const cookieOf = (res: request.Response, name: string) =>
  ([] as string[])
    .concat(res.headers['set-cookie'] ?? [])
    .find((c) => c.startsWith(`${name}=`))
    ?.split(';')[0];

describe('cart', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const add = (cookie: string | undefined, variantId: string, quantity = 1) => {
    const req = http().post('/api/v1/cart/items').set('Origin', TEST_ORIGIN);
    if (cookie) req.set('Cookie', cookie);
    return req.send({ variantId, quantity });
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await retireTestStores(prisma);
    await app.close();
  });

  it('creates a guest cart on first add, with a hashed cookie token', async () => {
    const store = await createStore(prisma);
    const product = await createProduct(prisma, {
      storeId: store.id,
      variants: [{ priceTiyin: 50_000_00n, stock: 10 }],
    });
    const variantId = product.variants[0]?.id ?? '';

    const empty = await http().get('/api/v1/cart').expect(200);
    expect(cartResponseSchema.parse(empty.body).cart.groups).toEqual([]);
    expect(cookieOf(empty, 'uzgo_cart')).toBeUndefined();

    const res = await add(undefined, variantId, 2).expect(201);
    const cookie = cookieOf(res, 'uzgo_cart');
    expect(cookie).toMatch(/^uzgo_cart=[A-Za-z0-9_-]{43}$/);
    const token = cookie?.split('=')[1] ?? '';
    expect(await prisma.cart.count({ where: { guestTokenHash: token } })).toBe(0);

    const { cart } = cartResponseSchema.parse(res.body);
    expect(cart.itemCount).toBe(2);
    expect(cart.totalTiyin).toBe('10000000');
    expect(cart.groups[0]?.store.slug).toBe(store.slug);

    const again = await add(cookie, variantId, 1).expect(201);
    expect(cartResponseSchema.parse(again.body).cart.groups[0]?.lines[0]?.quantity).toBe(3);
    expect(cookieOf(again, 'uzgo_cart')).toBeUndefined();
  });

  it('always uses current server prices and flags stock problems', async () => {
    const store = await createStore(prisma);
    const product = await createProduct(prisma, {
      storeId: store.id,
      variants: [{ priceTiyin: 10_000_00n, stock: 5 }],
    });
    const variantId = product.variants[0]?.id ?? '';
    const cookie = cookieOf(await add(undefined, variantId, 3).expect(201), 'uzgo_cart');

    await prisma.productVariant.update({
      where: { id: variantId },
      data: { priceTiyin: 12_000_00n },
    });
    let cart = cartResponseSchema.parse(
      (
        await http()
          .get('/api/v1/cart')
          .set('Cookie', cookie ?? '')
          .expect(200)
      ).body,
    ).cart;
    expect(cart.groups[0]?.lines[0]?.unitPriceTiyin).toBe('1200000');
    expect(cart.totalTiyin).toBe('3600000');

    await prisma.productVariant.update({ where: { id: variantId }, data: { stock: 2 } });
    cart = cartResponseSchema.parse(
      (
        await http()
          .get('/api/v1/cart')
          .set('Cookie', cookie ?? '')
          .expect(200)
      ).body,
    ).cart;
    expect(cart.groups[0]?.lines[0]?.status).toBe('INSUFFICIENT_STOCK');
    expect(cart.hasIssues).toBe(true);
    expect(cart.totalTiyin).toBe('0');

    await prisma.product.update({ where: { id: product.id }, data: { status: 'ARCHIVED' } });
    cart = cartResponseSchema.parse(
      (
        await http()
          .get('/api/v1/cart')
          .set('Cookie', cookie ?? '')
          .expect(200)
      ).body,
    ).cart;
    expect(cart.groups[0]?.lines[0]?.status).toBe('UNAVAILABLE');
  });

  it('rejects adding more than the stock, unavailable products and bad input', async () => {
    const store = await createStore(prisma);
    const product = await createProduct(prisma, {
      storeId: store.id,
      variants: [{ priceTiyin: 1000n, stock: 2 }],
    });
    const variantId = product.variants[0]?.id ?? '';
    const res = await add(undefined, variantId, 3).expect(409);
    expect(errorCode(res.body)).toBe('INSUFFICIENT_STOCK');

    const hidden = await createProduct(prisma, { storeId: store.id, status: 'PENDING_REVIEW' });
    expect(errorCode((await add(undefined, hidden.variants[0]?.id ?? '').expect(404)).body)).toBe(
      'PRODUCT_UNAVAILABLE',
    );

    for (const body of [
      { variantId, quantity: 0 },
      { variantId, quantity: 100 },
      { variantId, quantity: 1.5 },
      { variantId: 'x', quantity: 1 },
      { variantId, quantity: 1, priceTiyin: '1' },
    ]) {
      const bad = await http().post('/api/v1/cart/items').send(body).expect(400);
      expect(errorCode(bad.body)).toBe('VALIDATION_FAILED');
    }
  });

  it('updates and removes lines', async () => {
    const store = await createStore(prisma);
    const product = await createProduct(prisma, {
      storeId: store.id,
      variants: [{ priceTiyin: 1000n, stock: 9 }],
    });
    const variantId = product.variants[0]?.id ?? '';
    const cookie = cookieOf(await add(undefined, variantId).expect(201), 'uzgo_cart') ?? '';
    const patch = await http()
      .patch(`/api/v1/cart/items/${variantId}`)
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .send({ quantity: 7 })
      .expect(200);
    expect(cartResponseSchema.parse(patch.body).cart.itemCount).toBe(7);
    await http()
      .patch(`/api/v1/cart/items/${variantId}`)
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .send({ quantity: 10 })
      .expect(409);
    const del = await http()
      .delete(`/api/v1/cart/items/${variantId}`)
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .expect(200);
    expect(cartResponseSchema.parse(del.body).cart.groups).toEqual([]);
  });

  it('refuses cross-site cart changes', async () => {
    const store = await createStore(prisma);
    const product = await createProduct(prisma, { storeId: store.id });
    const cookie =
      cookieOf(await add(undefined, product.variants[0]?.id ?? '').expect(201), 'uzgo_cart') ?? '';
    await http()
      .delete(`/api/v1/cart/items/${product.variants[0]?.id ?? ''}`)
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example')
      .expect(403);
  });

  it('merges the guest cart into the user cart at login', async () => {
    const store = await createStore(prisma);
    const product = await createProduct(prisma, {
      storeId: store.id,
      variants: [{ priceTiyin: 1000n, stock: 20 }],
    });
    const variantId = product.variants[0]?.id ?? '';
    const guestCookie = cookieOf(await add(undefined, variantId, 2).expect(201), 'uzgo_cart') ?? '';

    const phone = randomPhone();
    const ip = randomIp();
    await http()
      .post('/api/v1/auth/otp/request')
      .set('X-Forwarded-For', ip)
      .send({ phone })
      .expect(200);
    const login = await http()
      .post('/api/v1/auth/otp/verify')
      .set('X-Forwarded-For', ip)
      .set('Cookie', guestCookie)
      .set('Origin', TEST_ORIGIN)
      .send({ phone, code: fakeSms(app).lastCodeFor(phone) })
      .expect(200);
    const session = cookieOf(login, 'uzgo_session') ?? '';
    expect(
      ([] as string[])
        .concat(login.headers['set-cookie'] ?? [])
        .some((c) => /^uzgo_cart=;/.test(c)),
    ).toBe(true);

    const userCart = cartResponseSchema.parse(
      (await http().get('/api/v1/cart').set('Cookie', session).expect(200)).body,
    ).cart;
    expect(userCart.groups[0]?.lines[0]).toMatchObject({ variantId, quantity: 2 });
    expect(
      await prisma.cart.count({
        where: { guestTokenHash: { not: null }, items: { some: { variantId } } },
      }),
    ).toBe(0);

    // The old guest cookie no longer resolves to a cart.
    const stale = cartResponseSchema.parse(
      (await http().get('/api/v1/cart').set('Cookie', guestCookie).expect(200)).body,
    );
    expect(stale.cart.groups).toEqual([]);
  });
});
