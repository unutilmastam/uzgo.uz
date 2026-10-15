import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  adminCourierListSchema,
  adminRestaurantSchema,
  apiErrorSchema,
  restaurantDetailSchema,
} from '@uzgo/contracts';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { postJournal } from '../src/ledger/ledger.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, login, loginStaff, randomIp, TEST_ORIGIN } from './app.js';
import { ALWAYS_OPEN, retireTestStores, TERMIZ } from './fixtures.js';

const errorCode = (body: unknown) => apiErrorSchema.parse(body).error.code;
const restaurantOf = (body: unknown) =>
  adminRestaurantSchema.parse((body as { restaurant: unknown }).restaurant);

describe('UZGO Food — staff: restaurants, menus, couriers (ADR 0024)', () => {
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

  const restaurantInput = (ownerPhone: string) => ({
    name: { uz: 'Termiz oshi', ru: 'Термезский плов' },
    slug: `test-store-osh-${randomUUID().slice(0, 8)}`,
    ownerPhone,
    districtId,
    address: 'Alpomish koʻchasi, 5',
    lat: TERMIZ.lat,
    lng: TERMIZ.lng,
    phone: '+998 90 111 22 33',
    deliveryMode: 'UZGO',
    openingHours: ALWAYS_OPEN,
    commissionBp: 1200,
  });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await loginStaff(app, 'ADMIN');
    districtId = (await prisma.district.findUniqueOrThrow({ where: { slug: 'termiz_city' } })).id;
  });

  afterAll(async () => {
    await retireTestStores(prisma);
    await app.close();
  });

  it('lets only admins add restaurants, for existing accounts, with valid data', async () => {
    const owner = await login(app);
    const input = restaurantInput(owner.phone);
    const moderator = await loginStaff(app, 'MODERATOR');
    await send('post', '/admin/restaurants', moderator.cookie, input).expect(403);
    await send('post', '/admin/restaurants', owner.cookie, input).expect(403);

    const unknown = await send('post', '/admin/restaurants', admin.cookie, {
      ...input,
      ownerPhone: '+998 99 000 00 01',
    }).expect(404);
    expect(errorCode(unknown.body)).toBe('USER_NOT_FOUND');
    // Outside Uzbekistan, bad hours, unknown fields.
    await send('post', '/admin/restaurants', admin.cookie, { ...input, lat: 55.75 }).expect(400);
    await send('post', '/admin/restaurants', admin.cookie, {
      ...input,
      openingHours: [{ day: 7, open: '09:00', close: '22:00' }],
    }).expect(400);
    await send('post', '/admin/restaurants', admin.cookie, { ...input, isDemo: true }).expect(400);

    const created = restaurantOf(
      (await send('post', '/admin/restaurants', admin.cookie, input).expect(201)).body,
    );
    expect(created).toMatchObject({
      status: 'ACTIVE',
      deliveryMode: 'UZGO',
      phone: '+998901112233',
      commissionBp: 1200,
      openNow: true,
      menu: [],
    });
    const dup = await send('post', '/admin/restaurants', admin.cookie, input).expect(409);
    expect(errorCode(dup.body)).toBe('SLUG_TAKEN');

    // The owner is a member and gets the seller role; restaurants stay out of the shop review queue.
    expect(
      await prisma.storeMember.count({ where: { storeId: created.id, userId: owner.userId } }),
    ).toBe(1);
    expect(
      await prisma.userRole.count({ where: { userId: owner.userId, role: 'SELLER_OWNER' } }),
    ).toBe(1);
    const stores = await http()
      .get('/api/v1/admin/stores?status=ACTIVE')
      .set('Cookie', admin.cookie)
      .expect(200);
    expect(JSON.stringify(stores.body)).not.toContain(created.id);
    await http().get(`/api/v1/catalog/stores/${created.slug}`).expect(404);
    expect(
      await prisma.auditEvent.count({
        where: { entityId: created.id, action: 'restaurant.created' },
      }),
    ).toBe(1);
  });

  it('builds a menu with photos; customers see only active dishes', async () => {
    const owner = await login(app);
    const restaurant = restaurantOf(
      (
        await send('post', '/admin/restaurants', admin.cookie, restaurantInput(owner.phone)).expect(
          201,
        )
      ).body,
    );
    const base = `/admin/restaurants/${restaurant.id}/menu`;
    const withCategory = restaurantOf(
      (
        await send('post', `${base}/categories`, admin.cookie, {
          name: { uz: 'Osh', ru: 'Плов' },
        }).expect(201)
      ).body,
    );
    const categoryId = withCategory.menu[0]?.id ?? '';
    await send('post', `${base}/items`, admin.cookie, {
      categoryId,
      name: { uz: 'Toʻy oshi', ru: 'Свадебный плов' },
      priceTiyin: '0',
    }).expect(400);
    await send('post', `${base}/items`, admin.cookie, {
      categoryId: randomUUID(),
      name: { uz: 'X', ru: 'X' },
      priceTiyin: '100',
    }).expect(400);
    const withItems = restaurantOf(
      (
        await send('post', `${base}/items`, admin.cookie, {
          categoryId,
          name: { uz: 'Toʻy oshi', ru: 'Свадебный плов' },
          priceTiyin: '3500000',
          mxikCode: '10202001001000000',
          packageCode: '1500567',
        }).expect(201)
      ).body,
    );
    await send('post', `${base}/items`, admin.cookie, {
      categoryId,
      name: { uz: 'Eski taom', ru: 'Старое блюдо' },
      priceTiyin: '100000',
    }).expect(201);
    const dish = withItems.menu[0]?.items[0];
    expect(dish).toMatchObject({ priceTiyin: '3500000', mxikCode: '10202001001000000' });

    const png = await sharp({
      create: { width: 40, height: 30, channels: 3, background: '#e8a33d' },
    })
      .png()
      .toBuffer();
    const upload = await http()
      .post(`/api/v1${base}/items/${dish?.id ?? ''}/image`)
      .set('Cookie', admin.cookie)
      .set('Origin', TEST_ORIGIN)
      .attach('file', png, { filename: 'osh.png', contentType: 'image/png' })
      .expect(200);
    expect(restaurantOf(upload.body).menu[0]?.items[0]?.image).toMatch(/\.webp$/);
    await http()
      .post(`/api/v1${base}/items/${dish?.id ?? ''}/image`)
      .set('Cookie', admin.cookie)
      .set('Origin', TEST_ORIGIN)
      .attach('file', Buffer.from('not an image'), { filename: 'x.png', contentType: 'image/png' })
      .expect(400);

    const all = restaurantOf(
      (await http().get(`/api/v1/admin/restaurants/${restaurant.id}`).set('Cookie', admin.cookie))
        .body,
    );
    const old = all.menu[0]?.items.find((i) => i.name.uz === 'Eski taom');
    await send('patch', `${base}/items/${old?.id ?? ''}`, admin.cookie, { archived: true }).expect(
      200,
    );
    const publicView = restaurantDetailSchema.parse(
      (await http().get(`/api/v1/food/restaurants/${restaurant.slug}`).expect(200)).body,
    );
    expect(publicView.menu[0]?.items.map((i) => i.name.uz)).toEqual(['Toʻy oshi']);

    // Suspended restaurants disappear for customers.
    await send('patch', `/admin/restaurants/${restaurant.id}`, admin.cookie, {
      status: 'SUSPENDED',
    }).expect(200);
    await http().get(`/api/v1/food/restaurants/${restaurant.slug}`).expect(404);
  });

  it('adds couriers and settles their cash without going past the balance', async () => {
    const courier = await login(app);
    const notYet = await send('post', '/admin/couriers', admin.cookie, {
      phone: '+998 99 000 00 02',
    }).expect(404);
    expect(errorCode(notYet.body)).toBe('USER_NOT_FOUND');
    await send('post', '/admin/couriers', admin.cookie, {
      phone: courier.phone,
      vehicle: 'BICYCLE',
    }).expect(201);
    expect(
      await prisma.userRole.count({ where: { userId: courier.userId, role: 'COURIER' } }),
    ).toBe(1);
    // The courier role is never handed out through the generic roles page.
    await send('post', `/admin/users/${courier.userId}/roles`, admin.cookie, {
      role: 'COURIER',
    }).expect(400);

    // The courier collected 50 000 soʻm of cash for UZGO and earned 9 000 soʻm.
    await prisma.$transaction((tx) =>
      postJournal(
        tx,
        [
          { account: 'COURIER_PAYABLE', amountTiyin: 5_000_000n, courierId: courier.userId },
          { account: 'PROVIDER_CLEARING', amountTiyin: -5_000_000n },
        ],
        { kind: 'test_cash' },
      ),
    );
    await prisma.$transaction((tx) =>
      postJournal(
        tx,
        [
          { account: 'COURIER_PAYABLE', amountTiyin: -900_000n, courierId: courier.userId },
          { account: 'PROVIDER_CLEARING', amountTiyin: 900_000n },
        ],
        { kind: 'test_fee' },
      ),
    );
    const list = adminCourierListSchema.parse(
      (await http().get('/api/v1/admin/couriers').set('Cookie', admin.cookie).expect(200)).body,
    );
    expect(list.items.find((c) => c.userId === courier.userId)).toMatchObject({
      vehicle: 'BICYCLE',
      status: 'ACTIVE',
      balanceTiyin: '-4100000',
    });

    const settle = (amountTiyin: string) =>
      send('post', `/admin/couriers/${courier.userId}/settlements`, admin.cookie, {
        amountTiyin,
        note: 'Kassa',
      });
    // Cannot pay a courier who owes UZGO, nor take more cash than they hold.
    expect(errorCode((await settle('100').expect(409)).body)).toBe('SETTLEMENT_EXCEEDS_BALANCE');
    expect(errorCode((await settle('-4100001').expect(409)).body)).toBe(
      'SETTLEMENT_EXCEEDS_BALANCE',
    );
    const after = await settle('-4100000').expect(200);
    expect(after.body).toEqual({ balanceTiyin: '0' });
    await send('post', `/admin/couriers/${courier.userId}/settlements`, admin.cookie, {
      amountTiyin: '0',
    }).expect(400);
    expect(
      await prisma.auditEvent.count({
        where: {
          action: 'courier.settlement',
          metadata: { path: ['courierId'], equals: courier.userId },
        },
      }),
    ).toBe(1);

    await send('patch', `/admin/couriers/${courier.userId}`, admin.cookie, {
      status: 'SUSPENDED',
    }).expect(204);
    expect(
      (await prisma.courierProfile.findUniqueOrThrow({ where: { userId: courier.userId } })).online,
    ).toBe(false);
  });
});
