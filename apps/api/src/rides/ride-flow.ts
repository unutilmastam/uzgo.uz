import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/http-exception.filter.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { OrderActor, OrderStatus, RideStatus } from '../generated/prisma/enums.js';
import { postJournal, refundPostings } from '../ledger/ledger.js';
import { notifyDriverOffer, notifyRideStatus } from '../notifications/templates.js';

type Tx = Prisma.TransactionClient;
type Actor = Extract<OrderActor, 'CUSTOMER' | 'DRIVER' | 'ADMIN' | 'SYSTEM'>;

/**
 * Settings needed by ride code that has no injected env (payments call it);
 * set once by RidesService at start-up from validated env.
 */
export const rideConfig = { offerRadiusM: 5000 };

/** Who may move a ride from one status to another (ADR 0025). */
export const RIDE_TRANSITIONS: Record<RideStatus, Partial<Record<RideStatus, Actor[]>>> = {
  AWAITING_PAYMENT: {
    SEARCHING: ['SYSTEM'],
    CANCELLED: ['CUSTOMER', 'ADMIN', 'SYSTEM'],
  },
  SEARCHING: {
    ACCEPTED: ['DRIVER'],
    CANCELLED: ['CUSTOMER', 'ADMIN', 'SYSTEM'],
    NO_DRIVER: ['SYSTEM'],
  },
  ACCEPTED: {
    ARRIVED: ['DRIVER'],
    // The driver gives the ride back: it is offered to others again.
    SEARCHING: ['DRIVER'],
    CANCELLED: ['CUSTOMER', 'ADMIN', 'SYSTEM'],
  },
  ARRIVED: {
    IN_PROGRESS: ['DRIVER'],
    // DRIVER: the rider did not come.
    CANCELLED: ['CUSTOMER', 'DRIVER', 'ADMIN', 'SYSTEM'],
  },
  IN_PROGRESS: {
    COMPLETED: ['DRIVER', 'ADMIN'],
    CANCELLED: ['ADMIN'],
  },
  COMPLETED: {},
  CANCELLED: {},
  NO_DRIVER: {},
};

export const ACTIVE_RIDE: RideStatus[] = ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'];
export const OPEN_RIDE: RideStatus[] = ['AWAITING_PAYMENT', 'SEARCHING', ...ACTIVE_RIDE];

export function canMoveRide(from: RideStatus, to: RideStatus, actor: Actor): boolean {
  return RIDE_TRANSITIONS[from][to]?.includes(actor) ?? false;
}

/** The order record follows the ride. */
function orderStatusFor(ride: RideStatus): OrderStatus {
  switch (ride) {
    case 'AWAITING_PAYMENT':
      return 'AWAITING_PAYMENT';
    case 'SEARCHING':
      return 'CREATED';
    case 'ACCEPTED':
    case 'ARRIVED':
    case 'IN_PROGRESS':
      return 'CONFIRMED';
    case 'COMPLETED':
      return 'COMPLETED';
    case 'CANCELLED':
    case 'NO_DRIVER':
      return 'CANCELLED';
  }
}

type LockedRide = {
  id: string;
  orderId: string;
  riderId: string;
  driverId: string | null;
  status: RideStatus;
  priceTiyin: bigint;
  commissionTiyin: bigint;
  paymentMethod: string;
  paidAt: Date | null;
};

export async function lockRide(tx: Tx, rideId: string): Promise<LockedRide | null> {
  const [row] = await tx.$queryRaw<LockedRide[]>`
    SELECT r."id", r."orderId", r."riderId", r."driverId", r."status"::text AS "status",
           r."priceTiyin", r."commissionTiyin", o."paymentMethod"::text AS "paymentMethod",
           o."paidAt"
    FROM "Ride" r JOIN "Order" o ON o."id" = r."orderId"
    WHERE r."id" = ${rideId}::uuid
    FOR UPDATE OF r, o`;
  return row ?? null;
}

/**
 * Moves a ride (row-locked with its order), keeps the order status in step,
 * writes the order event, books the money and queues notifications.
 * - ACCEPTED: `by.userId` becomes the driver (the lock makes the first one win).
 * - COMPLETED, paid online: prepayment → driver payable + UZGO commission;
 *   cash: the driver owes UZGO the commission.
 * - CANCELLED / NO_DRIVER after an online payment: a full refund (PENDING for
 *   Payme/Click staff processing; DEV_ONLINE completes at once), unless the
 *   provider already returned the money.
 */
export async function transitionRide(
  tx: Tx,
  rideId: string,
  to: RideStatus,
  by: { actor: Actor; userId: string | null; reason?: string | undefined },
  options: { providerRefunded?: boolean } = {},
): Promise<RideStatus> {
  const ride = await lockRide(tx, rideId);
  if (!ride) throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Ride not found');
  if (!canMoveRide(ride.status, to, by.actor)) {
    throw new AppException(
      HttpStatus.CONFLICT,
      'INVALID_TRANSITION',
      `Cannot move a ${ride.status} ride to ${to}`,
      { from: ride.status, to },
    );
  }
  // A driver acts only on their own ride (accepting makes it theirs).
  if (by.actor === 'DRIVER' && to !== 'ACCEPTED' && ride.driverId !== by.userId) {
    throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Ride not found');
  }
  if (by.actor === 'CUSTOMER' && ride.riderId !== by.userId) {
    throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Ride not found');
  }
  const now = new Date();
  const releasing = to === 'SEARCHING' && ride.status !== 'AWAITING_PAYMENT';
  await tx.ride.update({
    where: { id: ride.id },
    data: {
      status: to,
      ...(to === 'SEARCHING' ? { searchingAt: now } : {}),
      ...(releasing ? { driverId: null, acceptedAt: null } : {}),
      ...(to === 'ACCEPTED' ? { driverId: by.userId, acceptedAt: now } : {}),
      ...(to === 'ARRIVED' ? { arrivedAt: now } : {}),
      ...(to === 'IN_PROGRESS' ? { startedAt: now } : {}),
      ...(to === 'COMPLETED' || to === 'CANCELLED' || to === 'NO_DRIVER'
        ? { finishedAt: now }
        : {}),
      ...(to === 'CANCELLED' || to === 'NO_DRIVER'
        ? { cancelledBy: by.actor, cancelReason: by.reason ?? null }
        : {}),
    },
  });
  await tx.order.update({ where: { id: ride.orderId }, data: { status: orderStatusFor(to) } });
  await tx.orderEvent.create({
    data: {
      orderId: ride.orderId,
      actorId: by.userId,
      actorType: by.actor,
      fromStatus: ride.status,
      toStatus: to,
      reason: by.reason ?? null,
    },
  });
  if (ride.status === 'AWAITING_PAYMENT' && to === 'CANCELLED') {
    await tx.paymentAttempt.updateMany({
      where: { orderId: ride.orderId, status: 'PENDING' },
      data: { status: 'CANCELLED', cancelledAt: now },
    });
  }

  const refs = { orderId: ride.orderId };
  const paidOnline = ride.paymentMethod !== 'CASH_ON_DELIVERY' && ride.paidAt !== null;
  if (to === 'COMPLETED') {
    const driverId = ride.driverId;
    if (!driverId) throw new Error('Completed ride without a driver');
    const price = ride.priceTiyin;
    const commission = ride.commissionTiyin;
    if (paidOnline) {
      await postJournal(
        tx,
        [
          { account: 'CUSTOMER_PREPAYMENTS', amountTiyin: price },
          { account: 'DRIVER_PAYABLE', amountTiyin: -(price - commission), driverId },
          { account: 'PLATFORM_REVENUE', amountTiyin: -commission },
        ],
        { kind: 'ride_completed', ...refs },
      );
    } else if (ride.paymentMethod === 'CASH_ON_DELIVERY') {
      // The driver took the whole price in cash: they owe UZGO the commission.
      await postJournal(
        tx,
        [
          { account: 'DRIVER_PAYABLE', amountTiyin: commission, driverId },
          { account: 'PLATFORM_REVENUE', amountTiyin: -commission },
        ],
        { kind: 'ride_cash_commission', ...refs },
      );
    }
  }
  if ((to === 'CANCELLED' || to === 'NO_DRIVER') && paidOnline && !options.providerRefunded) {
    const payment = await tx.paymentAttempt.findFirstOrThrow({
      where: { orderId: ride.orderId, status: 'PAID' },
      select: { id: true, method: true },
    });
    const refund = await tx.refund.create({
      data: {
        orderId: ride.orderId,
        paymentAttemptId: payment.id,
        amountTiyin: ride.priceTiyin,
        reason: to === 'NO_DRIVER' ? 'ride_no_driver' : 'ride_cancelled',
      },
    });
    // The simulated provider "returns" money instantly (development/tests only).
    if (payment.method === 'DEV_ONLINE') {
      await tx.refund.update({
        where: { id: refund.id },
        data: { status: 'SUCCEEDED', reference: 'dev', processedAt: now },
      });
      await refundPostings(tx, refund);
    }
  }

  if (to === 'SEARCHING') {
    await notifyDriverOffer(tx, ride.id, rideConfig.offerRadiusM);
  } else if (to === 'CANCELLED' && by.actor === 'CUSTOMER') {
    await notifyRideStatus(tx, ride.id, to, { cancelledByRider: true, driverId: ride.driverId });
  } else {
    await notifyRideStatus(tx, ride.id, to);
  }
  return to;
}
