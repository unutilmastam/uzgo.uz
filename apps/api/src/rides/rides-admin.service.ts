import { HttpStatus, Injectable } from '@nestjs/common';
import type { AdminDriver, AdminRide } from '@uzgo/contracts';
import type { Meta } from '../admin/meta.js';
import { AuditService } from '../audit/audit.service.js';
import { AppException } from '../common/http-exception.filter.js';
import type { DriverStatus, RideClass, RideStatus } from '../generated/prisma/enums.js';
import { Role } from '../generated/prisma/enums.js';
import { postJournal } from '../ledger/ledger.js';
import { PaymentsService } from '../payments/payments.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { carOf, driverBalance } from './drivers.service.js';
import { transitionRide } from './ride-flow.js';

const notFound = (what: string) =>
  new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${what} not found`);

/** Staff side of UZGO Go (ADR 0025): review drivers, settle money, cancel rides. */
@Injectable()
export class RidesAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly payments: PaymentsService,
  ) {}

  async listDrivers(status: DriverStatus | undefined): Promise<{ items: AdminDriver[] }> {
    const rows = await this.prisma.driverProfile.findMany({
      where: status ? { status } : {},
      // Waiting applications first, oldest first; then everyone else, newest first.
      orderBy: [{ createdAt: status === 'PENDING' ? 'asc' : 'desc' }],
      take: 500,
      include: { user: { select: { phone: true } } },
    });
    const ids = rows.map((r) => r.userId);
    const [balances, completed] = await Promise.all([
      this.prisma.ledgerEntry.groupBy({
        by: ['driverId'],
        where: { account: 'DRIVER_PAYABLE', driverId: { in: ids } },
        orderBy: { driverId: 'asc' },
        _sum: { amountTiyin: true },
      }),
      this.prisma.ride.groupBy({
        by: ['driverId'],
        where: { driverId: { in: ids }, status: 'COMPLETED' },
        orderBy: { driverId: 'asc' },
        _count: { _all: true },
      }),
    ]);
    return {
      items: rows.map((r) => {
        const sum = balances.find((b) => b.driverId === r.userId)?._sum.amountTiyin ?? 0n;
        const done = completed.find((c) => c.driverId === r.userId)?._count;
        return {
          userId: r.userId,
          phone: r.user.phone,
          status: r.status,
          firstName: r.firstName,
          lastName: r.lastName,
          licenceNumber: r.licenceNumber,
          permitNumber: r.permitNumber,
          taxId: r.taxId,
          car: carOf(r),
          rideClass: r.rideClass,
          reviewNote: r.reviewNote,
          online: r.online,
          lastSeenAt: r.lastSeenAt?.toISOString() ?? null,
          balanceTiyin: (-sum).toString(),
          completedRides: typeof done === 'object' ? done._all : 0,
          createdAt: r.createdAt.toISOString(),
        };
      }),
    };
  }

  /** Approve (grants the DRIVER role) or reject (with a note) a waiting application. */
  async review(
    userId: string,
    input: { decision: 'APPROVE' | 'REJECT'; note?: string | undefined; rideClass?: RideClass },
    actorId: string,
    meta: Meta,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.driverProfile.updateMany({
        where: { userId, status: 'PENDING' },
        data: {
          status: input.decision === 'APPROVE' ? 'ACTIVE' : 'REJECTED',
          reviewNote: input.note ?? null,
          reviewedById: actorId,
          reviewedAt: new Date(),
          ...(input.rideClass ? { rideClass: input.rideClass } : {}),
        },
      });
      if (updated.count === 0) {
        const exists = await tx.driverProfile.count({ where: { userId } });
        if (exists === 0) throw notFound('Driver');
        throw new AppException(
          HttpStatus.CONFLICT,
          'NOT_PENDING',
          'Only waiting applications can be reviewed',
        );
      }
      if (input.decision === 'APPROVE') {
        await tx.userRole.createMany({
          data: [{ userId, role: Role.DRIVER, grantedById: actorId }],
          skipDuplicates: true,
        });
      }
      await this.audit.record(
        {
          action: input.decision === 'APPROVE' ? 'driver.approved' : 'driver.rejected',
          entityType: 'User',
          entityId: userId,
          actorId,
          metadata: { note: input.note ?? null, rideClass: input.rideClass ?? null },
          ...meta,
        },
        tx,
      );
    });
  }

  /** Suspend / reactivate an approved driver, or change their car class. */
  async update(
    userId: string,
    input: { status?: 'ACTIVE' | 'SUSPENDED'; rideClass?: RideClass; note?: string },
    actorId: string,
    meta: Meta,
  ) {
    const updated = await this.prisma.driverProfile.updateMany({
      where: { userId, status: { in: ['ACTIVE', 'SUSPENDED'] } },
      data: {
        ...(input.rideClass ? { rideClass: input.rideClass } : {}),
        // A suspended driver goes offline at once and sees no requests.
        ...(input.status
          ? {
              status: input.status,
              reviewNote: input.note ?? null,
              ...(input.status === 'SUSPENDED' ? { online: false } : {}),
            }
          : {}),
      },
    });
    if (updated.count === 0) throw notFound('Approved driver');
    await this.audit.record({
      action: 'driver.updated',
      entityType: 'User',
      entityId: userId,
      actorId,
      metadata: input,
      ...meta,
    });
  }

  /**
   * Commission handed in by the driver (negative amount) or a payout to them
   * (positive). Never more than the balance allows; serialized per driver.
   */
  async settle(
    userId: string,
    input: { amountTiyin: string; note?: string | undefined },
    actorId: string,
    meta: Meta,
  ): Promise<{ balanceTiyin: string }> {
    const amount = BigInt(input.amountTiyin);
    const balance = await this.prisma.$transaction(async (tx) => {
      const profile = await tx.driverProfile.findUnique({
        where: { userId },
        select: { userId: true },
      });
      if (!profile) throw notFound('Driver');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`driver:${userId}`}))`;
      const before = await driverBalance(tx, userId);
      if ((amount > 0n && amount > before) || (amount < 0n && -amount > -before)) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'SETTLEMENT_EXCEEDS_BALANCE',
          'The amount is more than the driver balance',
          { balanceTiyin: before.toString() },
        );
      }
      const settlement = await tx.driverSettlement.create({
        data: {
          driverId: userId,
          amountTiyin: amount,
          note: input.note ?? null,
          createdById: actorId,
        },
        select: { id: true },
      });
      await postJournal(
        tx,
        [
          { account: 'DRIVER_PAYABLE', amountTiyin: amount, driverId: userId },
          { account: 'PROVIDER_CLEARING', amountTiyin: -amount },
        ],
        { kind: amount > 0n ? 'driver_payout' : 'driver_cash_in' },
      );
      await this.audit.record(
        {
          action: 'driver.settlement',
          entityType: 'DriverSettlement',
          entityId: settlement.id,
          actorId,
          metadata: { driverId: userId, amountTiyin: amount.toString() },
          ...meta,
        },
        tx,
      );
      return before - amount;
    });
    return { balanceTiyin: balance.toString() };
  }

  async listRides(status: RideStatus | undefined): Promise<{ items: AdminRide[] }> {
    const rows = await this.prisma.ride.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        status: true,
        rideClass: true,
        priceTiyin: true,
        pickupLabel: true,
        dropoffLabel: true,
        cancelReason: true,
        createdAt: true,
        rider: { select: { phone: true } },
        driver: { select: { phone: true } },
        order: { select: { number: true, paymentMethod: true, paidAt: true } },
      },
    });
    return {
      items: rows.map((r) => ({
        number: r.order.number,
        status: r.status,
        rideClass: r.rideClass,
        priceTiyin: r.priceTiyin.toString(),
        paymentMethod: r.order.paymentMethod,
        paid: r.order.paidAt !== null,
        riderPhone: r.rider.phone,
        driverPhone: r.driver?.phone ?? null,
        pickupLabel: r.pickupLabel,
        dropoffLabel: r.dropoffLabel,
        cancelReason: r.cancelReason,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  /** Staff cancel any open ride (a paid one is refunded in full). */
  async cancelRide(number: string, reason: string, actorId: string, meta: Meta) {
    const ride = await this.prisma.ride.findFirst({
      where: { order: { number } },
      select: { id: true, orderId: true, status: true },
    });
    if (!ride) throw notFound('Ride');
    await this.prisma.$transaction(async (tx) => {
      const unpaid =
        ride.status === 'AWAITING_PAYMENT' &&
        (await this.payments.cancelUnpaidOrder(tx, ride.orderId, { userId: actorId, reason }));
      if (!unpaid) {
        await transitionRide(tx, ride.id, 'CANCELLED', { actor: 'ADMIN', userId: actorId, reason });
      }
      await this.audit.record(
        {
          action: 'ride.cancelled_by_staff',
          entityType: 'Order',
          entityId: ride.orderId,
          actorId,
          metadata: { reason, from: ride.status },
          ...meta,
        },
        tx,
      );
    });
  }
}
