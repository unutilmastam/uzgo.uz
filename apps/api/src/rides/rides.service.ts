import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type {
  RideClass,
  RideQuote,
  RideQuoteRequest,
  RideRequestInput,
  RideSummary,
  RideView,
} from '@uzgo/contracts';
import { sha256 } from '../common/crypto.js';
import { AppException } from '../common/http-exception.filter.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { distanceM } from '../food/geo.js';
import { Prisma } from '../generated/prisma/client.js';
import { notifyDriverOffer } from '../notifications/templates.js';
import { canonical, MAX_UNPAID_ORDERS, tashkentYear } from '../orders/orders.service.js';
import {
  enabledPaymentMethods,
  FISCAL_METHODS,
  ONLINE_METHODS,
} from '../payments/payment-methods.js';
import { PaymentsService } from '../payments/payments.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  boxAround,
  rideCommissionTiyin,
  rideEtaMinutes,
  rideFareTiyin,
  tariffFor,
} from './fare.js';
import { ACTIVE_RIDE, canMoveRide, rideConfig, transitionRide } from './ride-flow.js';

type Names = { uz: string; ru: string };

/** Shorter than this is not a ride. */
const MIN_RIDE_M = 200;

export const rideInclude = {
  order: {
    select: {
      number: true,
      paymentMethod: true,
      paymentDueAt: true,
      paidAt: true,
      comment: true,
      refunds: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { amountTiyin: true, status: true },
      },
    },
  },
  driver: {
    select: {
      phone: true,
      driverProfile: {
        select: {
          firstName: true,
          carMake: true,
          carModel: true,
          carColor: true,
          carYear: true,
          plateNumber: true,
          lastLat: true,
          lastLng: true,
          lastSeenAt: true,
        },
      },
    },
  },
} satisfies Prisma.RideInclude;
type RideRow = Prisma.RideGetPayload<{ include: typeof rideInclude }>;

export const notFound = () => new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Ride not found');

/** What the rider (or staff) sees. The driver's phone and position only while active. */
export function toRideView(ride: RideRow): RideView {
  const active = ACTIVE_RIDE.includes(ride.status);
  const profile = ride.driver?.driverProfile;
  const refund = ride.order.refunds[0];
  const position =
    active && profile && profile.lastLat !== null && profile.lastLng !== null && profile.lastSeenAt
      ? { lat: profile.lastLat, lng: profile.lastLng, at: profile.lastSeenAt.toISOString() }
      : null;
  return {
    number: ride.order.number,
    status: ride.status,
    rideClass: ride.rideClass,
    pickup: { lat: ride.pickupLat, lng: ride.pickupLng, label: ride.pickupLabel },
    dropoff: { lat: ride.dropoffLat, lng: ride.dropoffLng, label: ride.dropoffLabel },
    distanceM: ride.distanceM,
    etaMinutes: ride.etaMinutes,
    priceTiyin: ride.priceTiyin.toString(),
    paymentMethod: ride.order.paymentMethod,
    awaitingPayment: ride.status === 'AWAITING_PAYMENT',
    paymentDueAt:
      ride.status === 'AWAITING_PAYMENT' ? (ride.order.paymentDueAt?.toISOString() ?? null) : null,
    paid: ride.order.paidAt !== null,
    refund: refund ? { amountTiyin: refund.amountTiyin.toString(), status: refund.status } : null,
    comment: ride.order.comment,
    driver:
      ride.driver && profile
        ? {
            name: profile.firstName,
            phone: active ? ride.driver.phone : null,
            car: {
              make: profile.carMake,
              model: profile.carModel,
              color: profile.carColor,
              year: profile.carYear,
              plate: profile.plateNumber,
            },
            position,
          }
        : null,
    canCancel: canMoveRide(ride.status, 'CANCELLED', 'CUSTOMER'),
    createdAt: ride.createdAt.toISOString(),
    acceptedAt: ride.acceptedAt?.toISOString() ?? null,
    arrivedAt: ride.arrivedAt?.toISOString() ?? null,
    startedAt: ride.startedAt?.toISOString() ?? null,
    finishedAt: ride.finishedAt?.toISOString() ?? null,
    cancelledBy:
      ride.cancelledBy === 'CUSTOMER' ||
      ride.cancelledBy === 'DRIVER' ||
      ride.cancelledBy === 'ADMIN' ||
      ride.cancelledBy === 'SYSTEM'
        ? ride.cancelledBy
        : null,
  };
}

/**
 * Riders (ADR 0025): price a trip, order it, follow it, cancel it. Prices,
 * commission and availability are decided here; the client only shows them.
 */
@Injectable()
export class RidesService {
  private readonly logger = new Logger(RidesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    @Inject(ENV) private readonly env: Env,
  ) {
    rideConfig.offerRadiusM = env.RIDE_OFFER_RADIUS_KM * 1000;
  }

  private price(rideClass: RideClass, straightM: number) {
    return rideFareTiyin(straightM, tariffFor(this.env, rideClass));
  }

  /** Online drivers near the pickup, per class (comfort cars also count for economy). */
  private async driversNearby(pickup: { lat: number; lng: number }) {
    const radiusM = this.env.RIDE_OFFER_RADIUS_KM * 1000;
    const box = boxAround(pickup, radiusM);
    const rows = await this.prisma.driverProfile.findMany({
      where: {
        status: 'ACTIVE',
        online: true,
        lastLat: box.lat,
        lastLng: box.lng,
        lastSeenAt: { gte: new Date(Date.now() - 15 * 60_000) },
      },
      take: 200,
      select: { rideClass: true, lastLat: true, lastLng: true },
    });
    const near = rows.filter(
      (r) =>
        r.lastLat !== null &&
        r.lastLng !== null &&
        distanceM(pickup, { lat: r.lastLat, lng: r.lastLng }) <= radiusM,
    );
    return {
      ECONOMY: near.length,
      COMFORT: near.filter((r) => r.rideClass === 'COMFORT').length,
    };
  }

  async quote(input: RideQuoteRequest): Promise<RideQuote> {
    const straight = Math.round(distanceM(input.pickup, input.dropoff));
    return {
      distanceM: straight,
      etaMinutes: rideEtaMinutes(straight),
      tooFar: straight > this.env.RIDE_MAX_KM * 1000,
      options: (['ECONOMY', 'COMFORT'] as const).map((rideClass) => ({
        rideClass,
        priceTiyin: this.price(rideClass, straight).toString(),
      })),
      driversNearby: await this.driversNearby(input.pickup),
    };
  }

  async request(
    userId: string,
    input: RideRequestInput,
    idempotencyKey: string,
  ): Promise<RideView> {
    const requestHash = sha256(canonical(input));
    if (!enabledPaymentMethods(this.env).includes(input.paymentMethod)) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'PAYMENT_METHOD_UNAVAILABLE',
        'This payment method is not available',
      );
    }
    if (
      FISCAL_METHODS.has(input.paymentMethod) &&
      (!this.env.RIDE_MXIK_CODE || !this.env.RIDE_PACKAGE_CODE)
    ) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'FISCAL_DATA_MISSING',
        'Rides cannot be paid online yet',
      );
    }
    const straight = Math.round(distanceM(input.pickup, input.dropoff));
    if (straight < MIN_RIDE_M) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'RIDE_TOO_SHORT',
        'Pickup and drop-off are too close',
      );
    }
    if (straight > this.env.RIDE_MAX_KM * 1000) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'RIDE_TOO_LONG',
        'This trip is too long for one ride',
        { maxKm: this.env.RIDE_MAX_KM },
      );
    }
    const price = this.price(input.rideClass, straight);
    if (price.toString() !== input.expectedPriceTiyin) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'PRICE_CHANGED',
        'The price has changed',
        { priceTiyin: price.toString() },
      );
    }
    const online = ONLINE_METHODS.has(input.paymentMethod);

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const inserted = await tx.$queryRaw<{ id: string }[]>`
            INSERT INTO "IdempotencyKey" ("id", "userId", "scope", "key", "requestHash", "response")
            VALUES (gen_random_uuid(), ${userId}::uuid, 'ride_request', ${idempotencyKey}, ${requestHash}, '{}'::jsonb)
            ON CONFLICT ("userId", "scope", "key") DO NOTHING
            RETURNING "id"`;
          const keyRow = inserted[0];
          if (!keyRow) {
            const existing = await tx.idempotencyKey.findUniqueOrThrow({
              where: { userId_scope_key: { userId, scope: 'ride_request', key: idempotencyKey } },
            });
            if (existing.requestHash !== requestHash) {
              throw new AppException(
                HttpStatus.CONFLICT,
                'IDEMPOTENCY_KEY_REUSED',
                'This Idempotency-Key was used for a different request',
              );
            }
            return existing.response as unknown as RideView;
          }

          const open = await tx.ride.count({
            where: {
              riderId: userId,
              status: { in: ['AWAITING_PAYMENT', 'SEARCHING', ...ACTIVE_RIDE] },
            },
          });
          if (open > 0) throw this.alreadyActive();
          if (online) {
            const unpaid = await tx.order.count({ where: { userId, status: 'AWAITING_PAYMENT' } });
            if (unpaid >= MAX_UNPAID_ORDERS) {
              throw new AppException(
                HttpStatus.CONFLICT,
                'TOO_MANY_UNPAID_ORDERS',
                'Pay or cancel your unpaid orders first',
              );
            }
          }
          const district = await tx.district.findFirst({
            where: { id: input.districtId, active: true },
            select: { id: true, name: true, region: { select: { name: true } } },
          });
          if (!district) {
            throw new AppException(HttpStatus.BAD_REQUEST, 'INVALID_DISTRICT', 'Unknown district');
          }
          const user = await tx.user.findUniqueOrThrow({
            where: { id: userId },
            select: { phone: true, profile: { select: { firstName: true, lastName: true } } },
          });
          const name =
            [user.profile?.firstName, user.profile?.lastName].filter(Boolean).join(' ') ||
            user.phone;

          const [{ seq }] = await tx.$queryRaw<
            [{ seq: bigint }]
          >`SELECT nextval('order_number_seq') AS seq`;
          const number = `UZ-${tashkentYear(new Date())}-${seq.toString().padStart(6, '0')}`;
          const status = online ? 'AWAITING_PAYMENT' : 'SEARCHING';
          const order = await tx.order.create({
            data: {
              kind: 'RIDE',
              number,
              userId,
              paymentMethod: input.paymentMethod,
              status: online ? 'AWAITING_PAYMENT' : 'CREATED',
              paymentDueAt: online
                ? new Date(Date.now() + this.env.PAYMENT_WINDOW_MINUTES * 60_000)
                : null,
              itemsTotalTiyin: price,
              deliveryTotalTiyin: 0n,
              totalTiyin: price,
              recipientName: name,
              recipientPhone: user.phone,
              districtId: district.id,
              addressLine: input.pickup.label,
              addressSnapshot: {
                district: district.name as Names,
                region: district.region.name as Names,
              },
              comment: input.comment ?? null,
              ride: {
                create: {
                  riderId: userId,
                  rideClass: input.rideClass,
                  status,
                  pickupLat: input.pickup.lat,
                  pickupLng: input.pickup.lng,
                  pickupLabel: input.pickup.label,
                  dropoffLat: input.dropoff.lat,
                  dropoffLng: input.dropoff.lng,
                  dropoffLabel: input.dropoff.label,
                  distanceM: straight,
                  etaMinutes: rideEtaMinutes(straight),
                  priceTiyin: price,
                  commissionTiyin: rideCommissionTiyin(price, this.env.RIDE_COMMISSION_BP),
                  searchingAt: online ? null : new Date(),
                },
              },
            },
            select: { id: true, ride: { select: { id: true } } },
          });
          const rideId = order.ride?.id;
          if (!rideId) throw new Error('Ride was not created');
          await tx.orderEvent.create({
            data: { orderId: order.id, actorId: userId, actorType: 'CUSTOMER', toStatus: status },
          });
          // Cash rides go to drivers now; online ones once paid (payments module).
          if (!online) {
            await notifyDriverOffer(tx, rideId, rideConfig.offerRadiusM);
          }
          const view = toRideView(
            await tx.ride.findUniqueOrThrow({ where: { id: rideId }, include: rideInclude }),
          );
          await tx.idempotencyKey.update({ where: { id: keyRow.id }, data: { response: view } });
          return view;
        },
        { timeout: 20_000 },
      );
    } catch (err) {
      // The partial unique index is the final guard against two open rides.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw this.alreadyActive();
      }
      throw err;
    }
  }

  private alreadyActive() {
    return new AppException(
      HttpStatus.CONFLICT,
      'RIDE_ALREADY_ACTIVE',
      'Finish or cancel your current ride first',
    );
  }

  async list(userId: string): Promise<{ items: RideSummary[] }> {
    const rows = await this.prisma.ride.findMany({
      where: { riderId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        status: true,
        rideClass: true,
        pickupLabel: true,
        dropoffLabel: true,
        priceTiyin: true,
        createdAt: true,
        order: { select: { number: true } },
      },
    });
    return {
      items: rows.map((r) => ({
        number: r.order.number,
        status: r.status,
        rideClass: r.rideClass,
        pickupLabel: r.pickupLabel,
        dropoffLabel: r.dropoffLabel,
        priceTiyin: r.priceTiyin.toString(),
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  /** Riders only ever see their own rides (others: 404, no existence leak). */
  async get(userId: string, number: string): Promise<RideView> {
    const ride = await this.prisma.ride.findFirst({
      where: { riderId: userId, order: { number } },
      include: rideInclude,
    });
    if (!ride) throw notFound();
    return toRideView(ride);
  }

  async cancel(userId: string, number: string, reason: string | undefined): Promise<RideView> {
    const ride = await this.prisma.ride.findFirst({
      where: { riderId: userId, order: { number } },
      select: { id: true, orderId: true, status: true },
    });
    if (!ride) throw notFound();
    await this.prisma.$transaction(async (tx) => {
      if (ride.status === 'AWAITING_PAYMENT') {
        // Same path as the payment window: pending provider attempts are closed too.
        const done = await this.payments.cancelUnpaidOrder(tx, ride.orderId, {
          userId,
          reason: reason ?? 'customer_cancelled',
        });
        if (done) return;
      }
      await transitionRide(tx, ride.id, 'CANCELLED', {
        actor: 'CUSTOMER',
        userId,
        reason: reason ?? 'customer_cancelled',
      });
    });
    return this.get(userId, number);
  }

  /**
   * Nobody took the ride in time: NO_DRIVER (online payments are refunded by
   * the ride flow). Returns how many.
   */
  async expireSearches(now = new Date()): Promise<number> {
    const deadline = new Date(now.getTime() - this.env.RIDE_SEARCH_TIMEOUT_MINUTES * 60_000);
    const stale = await this.prisma.ride.findMany({
      where: { status: 'SEARCHING', searchingAt: { lt: deadline } },
      orderBy: { searchingAt: 'asc' },
      take: 100,
      select: { id: true },
    });
    let expired = 0;
    for (const ride of stale) {
      try {
        await this.prisma.$transaction((tx) =>
          transitionRide(tx, ride.id, 'NO_DRIVER', {
            actor: 'SYSTEM',
            userId: null,
            reason: 'No driver accepted in time',
          }),
        );
        expired += 1;
      } catch (err) {
        // Accepted meanwhile (state changed): nothing to do.
        if (!(err instanceof AppException)) throw err;
        this.logger.debug({ id: ride.id }, 'Skipped: no longer searching');
      }
    }
    return expired;
  }
}
