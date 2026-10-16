import { randomInt, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  adminDriverListSchema,
  adminRideListSchema,
  apiErrorSchema,
  driverApplicationResponseSchema,
  driverMeSchema,
  driverOffersSchema,
  orderSummarySchema,
  rideListSchema,
  rideQuoteSchema,
  rideViewSchema,
} from '@uzgo/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RidesService } from '../src/rides/rides.service.js';
import { createTestApp, login, loginStaff, randomIp, TEST_ORIGIN } from './app.js';

const errorCode = (body: unknown) => apiErrorSchema.parse(body).error.code;
const rideOf = (body: unknown) => rideViewSchema.parse((body as { ride: unknown }).ride);

/** A random spot in Uzbekistan per run, so leftovers of earlier runs never interfere. */
const BASE = { lat: 39.5 + randomInt(0, 1000) / 1000, lng: 64 + randomInt(0, 2000) / 1000 };
const near = (dLat: number, dLng: number) => ({ lat: BASE.lat + dLat, lng: BASE.lng + dLng });
/** ~3 km apart. */
const PICKUP = { ...near(0, 0), label: 'Mustaqillik koʻchasi, 1' };
const DROPOFF = { ...near(0.027, 0), label: 'Bozor' };

describe('UZGO Go — drivers and rides (ADR 0025)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: Awaited<ReturnType<typeof loginStaff>>;
  let districtId = '';
  const plates = new Set<string>();
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
    http().get(`/api/v1${path}`).set('Cookie', cookie).set('X-Forwarded-For', randomIp());

  const plate = () => {
    let p = '';
    do p = `${String(randomInt(10, 99))}A${String(randomInt(100, 999))}TS`;
    while (plates.has(p));
    plates.add(p);
    return p;
  };
  const application = (overrides: object = {}) => ({
    firstName: 'Bobur',
    lastName: 'Karimov',
    licenceNumber: 'af 1234567',
    carMake: 'Chevrolet',
    carModel: 'Cobalt',
    carColor: 'Oq',
    carYear: 2021,
    plateNumber: plate(),
    acceptTerms: true,
    ...overrides,
  });

  /** A signed-in user who applied, was approved and is online at `at`. */
  async function driver(at = near(0.005, 0.005), rideClass: 'ECONOMY' | 'COMFORT' = 'ECONOMY') {
    const user = await login(app);
    await send('put', '/driver/application', user.cookie, application({ rideClass })).expect(200);
    await send('post', `/admin/drivers/${user.userId}/review`, admin.cookie, {
      decision: 'APPROVE',
    }).expect(204);
    await send('put', '/driver/status', user.cookie, { online: true, ...at }).expect(200);
    return user;
  }

  const quote = async (pickup = PICKUP, dropoff = DROPOFF) =>
    rideQuoteSchema.parse(
      (
        await http()
          .post('/api/v1/rides/quote')
          .set('X-Forwarded-For', randomIp())
          .send({
            pickup: { lat: pickup.lat, lng: pickup.lng },
            dropoff: { lat: dropoff.lat, lng: dropoff.lng },
          })
          .expect(200)
      ).body,
    );

  async function order(
    rider: { cookie: string },
    options: { rideClass?: 'ECONOMY' | 'COMFORT'; paymentMethod?: string; price?: string } = {},
    status = 201,
  ) {
    const rideClass = options.rideClass ?? 'ECONOMY';
    const q = await quote();
    const price = options.price ?? q.options.find((o) => o.rideClass === rideClass)?.priceTiyin;
    return http()
      .post('/api/v1/rides')
      .set('Cookie', rider.cookie)
      .set('Origin', TEST_ORIGIN)
      .set('X-Forwarded-For', randomIp())
      .set('Idempotency-Key', randomUUID())
      .send({
        rideClass,
        pickup: PICKUP,
        dropoff: DROPOFF,
        districtId,
        paymentMethod: options.paymentMethod ?? 'CASH_ON_DELIVERY',
        expectedPriceTiyin: price,
        comment: 'Darvoza oldida',
      })
      .expect(status);
  }

  const rideId = (number: string) =>
    prisma.ride
      .findFirstOrThrow({ where: { order: { number } }, select: { id: true } })
      .then((r) => r.id);
  const act = (cookie: string, id: string, action: string) =>
    send('post', `/driver/rides/${id}/action`, cookie, { action });
  const balanceOf = async (driverId: string) => {
    const sum = await prisma.ledgerEntry.aggregate({
      where: { account: 'DRIVER_PAYABLE', driverId },
      _sum: { amountTiyin: true },
    });
    return -(sum._sum.amountTiyin ?? 0n);
  };
  const journalsBalanced = async (orderId: string) => {
    const sum = await prisma.ledgerEntry.aggregate({
      where: { orderId },
      _sum: { amountTiyin: true },
    });
    return (sum._sum.amountTiyin ?? 0n) === 0n;
  };

  beforeAll(async () => {
    app = await createTestApp({ env: { DEV_PAYMENTS_ENABLED: 'true' } });
    prisma = app.get(PrismaService);
    admin = await loginStaff(app, 'ADMIN');
    districtId = (await prisma.district.findUniqueOrThrow({ where: { slug: 'termiz_city' } })).id;
  });

  afterAll(async () => {
    // Test drivers go offline so later runs on the same database start clean.
    await prisma.driverProfile.updateMany({ where: { online: true }, data: { online: false } });
    await app.close();
  });

  it('anyone applies; staff reject with a note, then approve; approved details are locked', async () => {
    const user = await login(app);
    const empty = driverApplicationResponseSchema.parse(
      (await get('/driver/application', user.cookie).expect(200)).body,
    );
    expect(empty.application).toBeNull();

    // Terms must be accepted; the plate is normalised.
    expect(
      errorCode(
        (
          await send(
            'put',
            '/driver/application',
            user.cookie,
            application({ acceptTerms: false }),
          ).expect(400)
        ).body,
      ),
    ).toBe('VALIDATION_FAILED');
    const myPlate = plate();
    const spaced = `${myPlate.slice(0, 2)} ${myPlate.slice(2, 3)} ${myPlate.slice(3)}`;
    const applied = driverApplicationResponseSchema.parse(
      (
        await send(
          'put',
          '/driver/application',
          user.cookie,
          application({ plateNumber: spaced.toLowerCase() }),
        ).expect(200)
      ).body,
    ).application;
    expect(applied).toMatchObject({ status: 'PENDING', licenceNumber: 'AF1234567' });
    expect(applied?.car.plate).toBe(myPlate);

    // The same plate cannot be used twice.
    const other = await login(app);
    const dup = await send(
      'put',
      '/driver/application',
      other.cookie,
      application({ plateNumber: myPlate }),
    ).expect(409);
    expect(errorCode(dup.body)).toBe('PLATE_TAKEN');

    // Not approved yet: no driver mode.
    expect(errorCode((await get('/driver/me', user.cookie).expect(403)).body)).toBe('NOT_A_DRIVER');
    // Only staff review.
    await send('post', `/admin/drivers/${user.userId}/review`, user.cookie, {
      decision: 'APPROVE',
    }).expect(403);

    const pending = adminDriverListSchema.parse(
      (await get('/admin/drivers?status=PENDING', admin.cookie).expect(200)).body,
    );
    expect(pending.items.some((d) => d.userId === user.userId)).toBe(true);

    // A rejection needs a note; the driver sees it and corrects the application.
    await send('post', `/admin/drivers/${user.userId}/review`, admin.cookie, {
      decision: 'REJECT',
    }).expect(400);
    await send('post', `/admin/drivers/${user.userId}/review`, admin.cookie, {
      decision: 'REJECT',
      note: 'Guvohnoma raqami notoʻgʻri',
    }).expect(204);
    const rejected = driverApplicationResponseSchema.parse(
      (await get('/driver/application', user.cookie).expect(200)).body,
    ).application;
    expect(rejected).toMatchObject({
      status: 'REJECTED',
      reviewNote: 'Guvohnoma raqami notoʻgʻri',
    });
    await send(
      'put',
      '/driver/application',
      user.cookie,
      application({ plateNumber: myPlate, licenceNumber: 'AF7654321' }),
    ).expect(200);

    await send('post', `/admin/drivers/${user.userId}/review`, admin.cookie, {
      decision: 'APPROVE',
      rideClass: 'COMFORT',
    }).expect(204);
    const roles = await prisma.userRole.findMany({ where: { userId: user.userId } });
    expect(roles.map((r) => r.role)).toContain('DRIVER');
    const me = driverMeSchema.parse((await get('/driver/me', user.cookie).expect(200)).body);
    expect(me).toMatchObject({ status: 'ACTIVE', rideClass: 'COMFORT', online: false });
    // A second review is refused; approved drivers change details through staff.
    expect(
      errorCode(
        (
          await send('post', `/admin/drivers/${user.userId}/review`, admin.cookie, {
            decision: 'APPROVE',
          }).expect(409)
        ).body,
      ),
    ).toBe('NOT_PENDING');
    expect(
      errorCode(
        (await send('put', '/driver/application', user.cookie, application()).expect(409)).body,
      ),
    ).toBe('APPLICATION_LOCKED');

    // Going online needs a position; suspension takes the driver offline.
    expect(
      errorCode(
        (await send('put', '/driver/status', user.cookie, { online: true }).expect(400)).body,
      ),
    ).toBe('LOCATION_REQUIRED');
    await send('put', '/driver/status', user.cookie, { online: true, ...BASE }).expect(200);
    await send('patch', `/admin/drivers/${user.userId}`, admin.cookie, {
      status: 'SUSPENDED',
      note: 'Shikoyat',
    }).expect(204);
    expect(errorCode((await get('/driver/me', user.cookie).expect(403)).body)).toBe(
      'DRIVER_SUSPENDED',
    );
    const profile = await prisma.driverProfile.findUniqueOrThrow({
      where: { userId: user.userId },
    });
    expect(profile.online).toBe(false);
  });

  it('quotes a fixed price per class for guests, with drivers nearby', async () => {
    await driver(near(0.002, 0), 'COMFORT');
    const q = await quote();
    expect(q.distanceM).toBeGreaterThan(2900);
    expect(q.distanceM).toBeLessThan(3100);
    const economy = BigInt(q.options.find((o) => o.rideClass === 'ECONOMY')?.priceTiyin ?? '0');
    const comfort = BigInt(q.options.find((o) => o.rideClass === 'COMFORT')?.priceTiyin ?? '0');
    expect(economy).toBeGreaterThan(0n);
    expect(comfort).toBeGreaterThan(economy);
    expect(economy % 50_000n).toBe(0n);
    expect(q.tooFar).toBe(false);
    // A comfort car counts for both classes.
    expect(q.driversNearby.COMFORT).toBeGreaterThanOrEqual(1);
    expect(q.driversNearby.ECONOMY).toBeGreaterThanOrEqual(q.driversNearby.COMFORT);

    const far = await quote(PICKUP, { lat: 41.3111, lng: 69.2797, label: 'Toshkent' });
    expect(far.tooFar).toBe(true);
  });

  it('cash ride: one driver wins, drives, completes; the driver owes UZGO the commission', async () => {
    const rider = await login(app);
    // The server price decides.
    const wrong = await order(rider, { price: '100' }, 422);
    expect(errorCode(wrong.body)).toBe('PRICE_CHANGED');

    const placed = rideOf((await order(rider)).body);
    expect(placed).toMatchObject({ status: 'SEARCHING', driver: null, canCancel: true });
    // One open ride at a time.
    expect(errorCode((await order(rider, {}, 409)).body)).toBe('RIDE_ALREADY_ACTIVE');
    // Rides have their own history, not the shop's order list.
    const orders = (await get('/orders', rider.cookie).expect(200)).body as { items: unknown[] };
    expect(orders.items.map((o) => orderSummarySchema.parse(o).number)).not.toContain(
      placed.number,
    );

    const first = await driver();
    const second = await driver(near(-0.004, 0.002));
    const id = await rideId(placed.number);
    const offers = driverOffersSchema.parse(
      (await get('/driver/offers', first.cookie).expect(200)).body,
    );
    const offer = offers.items.find((o) => o.id === id);
    // Before taking the ride: price, places and distance only — no rider details.
    expect(offer).toMatchObject({ rider: null, allowedActions: [], priceTiyin: placed.priceTiyin });
    expect(offer?.collectTiyin).toBe(placed.priceTiyin);

    const [a, b] = await Promise.all([
      send('post', `/driver/offers/${id}/accept`, first.cookie),
      send('post', `/driver/offers/${id}/accept`, second.cookie),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect(errorCode(loser.body)).toBe('OFFER_TAKEN');
    const winner = a.status === 200 ? first : second;
    const me = driverMeSchema.parse(a.status === 200 ? a.body : b.body);
    expect(me.active).toMatchObject({
      id,
      status: 'ACCEPTED',
      allowedActions: ['ARRIVED', 'RELEASE'],
    });
    expect(me.active?.rider).toMatchObject({ phone: rider.phone, comment: 'Darvoza oldida' });

    // The rider sees the driver, the car and where it is.
    const tracked = rideOf((await get(`/rides/${placed.number}`, rider.cookie).expect(200)).body);
    expect(tracked.status).toBe('ACCEPTED');
    expect(tracked.driver).toMatchObject({ name: 'Bobur', phone: winner.phone });
    expect(tracked.driver?.position).not.toBeNull();
    // Other users cannot see it.
    await get(`/rides/${placed.number}`, second.cookie).expect(404);
    // The other driver cannot act on it.
    await act(winner === first ? second.cookie : first.cookie, id, 'ARRIVED').expect(404);
    // Steps in order only.
    expect(errorCode((await act(winner.cookie, id, 'COMPLETE').expect(409)).body)).toBe(
      'INVALID_TRANSITION',
    );
    await act(winner.cookie, id, 'ARRIVED').expect(200);
    await act(winner.cookie, id, 'START').expect(200);
    // The trip has started: the rider can no longer cancel.
    expect(
      errorCode(
        (await send('post', `/rides/${placed.number}/cancel`, rider.cookie, {}).expect(409)).body,
      ),
    ).toBe('INVALID_TRANSITION');
    const before = await balanceOf(winner.userId);
    const done = driverMeSchema.parse((await act(winner.cookie, id, 'COMPLETE').expect(200)).body);
    expect(done.active).toBeNull();

    const finished = await prisma.ride.findUniqueOrThrow({
      where: { id },
      include: { order: true },
    });
    expect(finished.status).toBe('COMPLETED');
    expect(finished.order.status).toBe('COMPLETED');
    expect(await balanceOf(winner.userId)).toBe(before - finished.commissionTiyin);
    expect(finished.commissionTiyin).toBe(finished.priceTiyin / 10n);
    expect(await journalsBalanced(finished.orderId)).toBe(true);
    // After the ride: no phone, no position.
    const after = rideOf((await get(`/rides/${placed.number}`, rider.cookie).expect(200)).body);
    expect(after.driver).toMatchObject({ phone: null, position: null });
    expect(after.canCancel).toBe(false);
    const history = rideListSchema.parse((await get('/rides', rider.cookie).expect(200)).body);
    expect(history.items[0]).toMatchObject({ number: placed.number, status: 'COMPLETED' });
    // The rider was told by push only when they have the app; no SMS for a normal ride.
    const sms = await prisma.notification.count({
      where: { orderId: finished.orderId, channel: 'SMS' },
    });
    expect(sms).toBe(0);
  });

  it('online ride: waits for payment, a released ride is offered again, a cancel refunds in full', async () => {
    const rider = await login(app);
    const placed = rideOf((await order(rider, { paymentMethod: 'DEV_ONLINE' }, 201)).body);
    expect(placed).toMatchObject({
      status: 'AWAITING_PAYMENT',
      awaitingPayment: true,
      paid: false,
    });
    const id = await rideId(placed.number);
    const d = await driver();
    const unpaidOffers = driverOffersSchema.parse(
      (await get('/driver/offers', d.cookie).expect(200)).body,
    );
    expect(unpaidOffers.items.some((o) => o.id === id)).toBe(false);

    await send('post', `/payments/dev/${placed.number}`, rider.cookie, {
      outcome: 'success',
    }).expect(200);
    const paid = rideOf((await get(`/rides/${placed.number}`, rider.cookie).expect(200)).body);
    expect(paid).toMatchObject({ status: 'SEARCHING', paid: true });
    const offers = driverOffersSchema.parse(
      (await get('/driver/offers', d.cookie).expect(200)).body,
    );
    expect(offers.items.find((o) => o.id === id)?.collectTiyin).toBeNull();

    await send('post', `/driver/offers/${id}/accept`, d.cookie).expect(200);
    // The driver gives it back: searching again, without a driver.
    await act(d.cookie, id, 'RELEASE').expect(200);
    const released = rideOf((await get(`/rides/${placed.number}`, rider.cookie).expect(200)).body);
    expect(released).toMatchObject({ status: 'SEARCHING', driver: null });

    await send('post', `/driver/offers/${id}/accept`, d.cookie).expect(200);
    const cancelled = rideOf(
      (await send('post', `/rides/${placed.number}/cancel`, rider.cookie, {}).expect(200)).body,
    );
    expect(cancelled).toMatchObject({ status: 'CANCELLED', cancelledBy: 'CUSTOMER' });
    expect(cancelled.refund).toEqual({ amountTiyin: placed.priceTiyin, status: 'SUCCEEDED' });
    const me = driverMeSchema.parse((await get('/driver/me', d.cookie).expect(200)).body);
    expect(me.active).toBeNull();
    const row = await prisma.ride.findUniqueOrThrow({ where: { id }, include: { order: true } });
    expect(row.order.status).toBe('CANCELLED');
    expect(await journalsBalanced(row.orderId)).toBe(true);
    // Prepayment in and out again: nothing left for this order.
    const prepaid = await prisma.ledgerEntry.aggregate({
      where: { orderId: row.orderId, account: 'CUSTOMER_PREPAYMENTS' },
      _sum: { amountTiyin: true },
    });
    expect(prepaid._sum.amountTiyin ?? 0n).toBe(0n);
    // The driver who had the ride is told by push (when they have the app).
    expect(await balanceOf(d.userId)).toBe(0n);
  });

  it('online ride completed: UZGO owes the driver the fare minus commission; staff settle it', async () => {
    const rider = await login(app);
    const placed = rideOf(
      (await order(rider, { paymentMethod: 'DEV_ONLINE', rideClass: 'COMFORT' }, 201)).body,
    );
    await send('post', `/payments/dev/${placed.number}`, rider.cookie, {
      outcome: 'success',
    }).expect(200);
    const id = await rideId(placed.number);
    const economy = await driver();
    expect(
      errorCode(
        (await send('post', `/driver/offers/${id}/accept`, economy.cookie).expect(403)).body,
      ),
    ).toBe('RIDE_CLASS_MISMATCH');
    const comfort = await driver(near(0.003, -0.003), 'COMFORT');
    await send('post', `/driver/offers/${id}/accept`, comfort.cookie).expect(200);
    for (const step of ['ARRIVED', 'START', 'COMPLETE']) {
      await act(comfort.cookie, id, step).expect(200);
    }
    const ride = await prisma.ride.findUniqueOrThrow({ where: { id } });
    const owed = ride.priceTiyin - ride.commissionTiyin;
    expect(await balanceOf(comfort.userId)).toBe(owed);
    const listed = adminDriverListSchema
      .parse((await get('/admin/drivers', admin.cookie).expect(200)).body)
      .items.find((x) => x.userId === comfort.userId);
    expect(listed).toMatchObject({ balanceTiyin: owed.toString(), completedRides: 1 });

    const tooMuch = await send(
      'post',
      `/admin/drivers/${comfort.userId}/settlements`,
      admin.cookie,
      {
        amountTiyin: (owed + 1n).toString(),
      },
    ).expect(409);
    expect(errorCode(tooMuch.body)).toBe('SETTLEMENT_EXCEEDS_BALANCE');
    const paidOut = await send(
      'post',
      `/admin/drivers/${comfort.userId}/settlements`,
      admin.cookie,
      {
        amountTiyin: owed.toString(),
        note: 'Karta orqali',
      },
    ).expect(200);
    expect(paidOut.body).toEqual({ balanceTiyin: '0' });
    await expect(
      prisma.driverSettlement.deleteMany({ where: { driverId: comfort.userId } }),
    ).rejects.toThrow();
  });

  it('closes rides nobody took in time and texts the rider; staff can cancel and list rides', async () => {
    const rider = await login(app);
    const placed = rideOf((await order(rider, { paymentMethod: 'DEV_ONLINE' }, 201)).body);
    await send('post', `/payments/dev/${placed.number}`, rider.cookie, {
      outcome: 'success',
    }).expect(200);
    const rides = app.get(RidesService);
    // Not yet: inside the search window.
    await rides.expireSearches(new Date());
    expect(
      rideOf((await get(`/rides/${placed.number}`, rider.cookie).expect(200)).body).status,
    ).toBe('SEARCHING');
    expect(await rides.expireSearches(new Date(Date.now() + 11 * 60_000))).toBeGreaterThanOrEqual(
      1,
    );
    const closed = rideOf((await get(`/rides/${placed.number}`, rider.cookie).expect(200)).body);
    expect(closed).toMatchObject({ status: 'NO_DRIVER', cancelledBy: 'SYSTEM' });
    expect(closed.refund?.status).toBe('SUCCEEDED');
    const orderId = (await prisma.order.findUniqueOrThrow({ where: { number: placed.number } })).id;
    const sms = await prisma.notification.findMany({ where: { orderId, channel: 'SMS' } });
    expect(sms.map((n) => n.template)).toContain('ride.no_driver');

    // Staff cancel an open cash ride with a reason.
    const other = await login(app);
    const open = rideOf((await order(other)).body);
    await send('post', `/admin/rides/${open.number}/cancel`, admin.cookie, {}).expect(400);
    await send('post', `/admin/rides/${open.number}/cancel`, other.cookie, {
      reason: 'x',
    }).expect(403);
    await send('post', `/admin/rides/${open.number}/cancel`, admin.cookie, {
      reason: 'Yoʻlovchi qoʻngʻiroq qildi',
    }).expect(204);
    const list = adminRideListSchema.parse(
      (await get('/admin/rides?status=CANCELLED', admin.cookie).expect(200)).body,
    );
    expect(list.items.find((r) => r.number === open.number)).toMatchObject({
      cancelReason: 'Yoʻlovchi qoʻngʻiroq qildi',
      riderPhone: other.phone,
    });
  });
});
