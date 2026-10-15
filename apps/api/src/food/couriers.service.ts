import { HttpStatus, Injectable } from '@nestjs/common';
import type { AdminCourier } from '@uzgo/contracts';
import type { Meta } from '../admin/meta.js';
import { AuditService } from '../audit/audit.service.js';
import { normalizePhone } from '../auth/phone.js';
import { AppException } from '../common/http-exception.filter.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { CourierVehicle } from '../generated/prisma/enums.js';
import { Role } from '../generated/prisma/enums.js';
import { postJournal } from '../ledger/ledger.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Tx = Prisma.TransactionClient;

const notFound = () => new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Courier not found');

/** What UZGO owes the courier (negative: cash the courier holds for UZGO). */
export async function courierBalance(db: Tx | PrismaService, courierId: string): Promise<bigint> {
  const sum = await db.ledgerEntry.aggregate({
    where: { account: 'COURIER_PAYABLE', courierId },
    _sum: { amountTiyin: true },
  });
  return -(sum._sum.amountTiyin ?? 0n);
}

/** Staff side of couriers (ADR 0024): add, suspend, settle cash and pay. */
@Injectable()
export class CouriersAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<{ items: AdminCourier[] }> {
    const rows = await this.prisma.courierProfile.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        userId: true,
        status: true,
        vehicle: true,
        online: true,
        lastSeenAt: true,
        user: { select: { phone: true, profile: { select: { firstName: true, lastName: true } } } },
      },
    });
    const ids = rows.map((r) => r.userId);
    const [balances, active, delivered] = await Promise.all([
      this.prisma.ledgerEntry.groupBy({
        by: ['courierId'],
        where: { account: 'COURIER_PAYABLE', courierId: { in: ids } },
        orderBy: { courierId: 'asc' },
        _sum: { amountTiyin: true },
      }),
      this.prisma.sellerOrder.groupBy({
        by: ['courierId'],
        where: {
          courierId: { in: ids },
          status: { in: ['ACCEPTED', 'PACKED', 'HANDED_TO_DELIVERY'] },
        },
        orderBy: { courierId: 'asc' },
        _count: { _all: true },
      }),
      this.prisma.sellerOrder.groupBy({
        by: ['courierId'],
        where: { courierId: { in: ids }, status: 'DELIVERED' },
        orderBy: { courierId: 'asc' },
        _count: { _all: true },
      }),
    ]);
    const count = (groups: typeof active, id: string) => {
      const g = groups.find((x) => x.courierId === id);
      return g && typeof g._count === 'object' ? g._count._all : 0;
    };
    return {
      items: rows.map((r) => {
        const name = [r.user.profile?.firstName, r.user.profile?.lastName]
          .filter(Boolean)
          .join(' ');
        const sum = balances.find((b) => b.courierId === r.userId)?._sum.amountTiyin ?? 0n;
        return {
          userId: r.userId,
          phone: r.user.phone,
          name: name || null,
          status: r.status,
          vehicle: r.vehicle,
          online: r.online,
          lastSeenAt: r.lastSeenAt?.toISOString() ?? null,
          balanceTiyin: (-sum).toString(),
          activeOrders: count(active, r.userId),
          delivered: count(delivered, r.userId),
        };
      }),
    };
  }

  async create(input: { phone: string; vehicle: CourierVehicle }, actorId: string, meta: Meta) {
    const phone = normalizePhone(input.phone);
    if (!phone) throw new AppException(HttpStatus.BAD_REQUEST, 'INVALID_PHONE', 'Invalid phone');
    const user = await this.prisma.user.findFirst({
      where: { phone, deletedAt: null },
      select: { id: true },
    });
    if (!user) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'USER_NOT_FOUND',
        'The courier must sign in to UZGO once first',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.courierProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, vehicle: input.vehicle },
        update: { status: 'ACTIVE', vehicle: input.vehicle },
      });
      await tx.userRole.createMany({
        data: [{ userId: user.id, role: Role.COURIER, grantedById: actorId }],
        skipDuplicates: true,
      });
      await this.audit.record(
        {
          action: 'courier.added',
          entityType: 'User',
          entityId: user.id,
          actorId,
          metadata: { vehicle: input.vehicle },
          ...meta,
        },
        tx,
      );
    });
    return { userId: user.id };
  }

  async update(
    userId: string,
    input: { status?: 'ACTIVE' | 'SUSPENDED'; vehicle?: CourierVehicle },
    actorId: string,
    meta: Meta,
  ) {
    const updated = await this.prisma.courierProfile.updateMany({
      where: { userId },
      data: {
        ...(input.vehicle ? { vehicle: input.vehicle } : {}),
        // A suspended courier goes offline at once and sees no offers.
        ...(input.status
          ? { status: input.status, ...(input.status === 'SUSPENDED' ? { online: false } : {}) }
          : {}),
      },
    });
    if (updated.count === 0) throw notFound();
    await this.audit.record({
      action: 'courier.updated',
      entityType: 'User',
      entityId: userId,
      actorId,
      metadata: input,
      ...meta,
    });
  }

  /**
   * Cash handed in by the courier (negative amount) or a payout to them
   * (positive). Never more than the balance allows; serialized per courier.
   */
  async settle(
    userId: string,
    input: { amountTiyin: string; note?: string | undefined },
    actorId: string,
    meta: Meta,
  ): Promise<{ balanceTiyin: string }> {
    const amount = BigInt(input.amountTiyin);
    const balance = await this.prisma.$transaction(async (tx) => {
      const profile = await tx.courierProfile.findUnique({
        where: { userId },
        select: { userId: true },
      });
      if (!profile) throw notFound();
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`courier:${userId}`}))`;
      const before = await courierBalance(tx, userId);
      if ((amount > 0n && amount > before) || (amount < 0n && -amount > -before)) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'SETTLEMENT_EXCEEDS_BALANCE',
          'The amount is more than the courier balance',
          { balanceTiyin: before.toString() },
        );
      }
      const settlement = await tx.courierSettlement.create({
        data: {
          courierId: userId,
          amountTiyin: amount,
          note: input.note ?? null,
          createdById: actorId,
        },
        select: { id: true },
      });
      await postJournal(
        tx,
        [
          { account: 'COURIER_PAYABLE', amountTiyin: amount, courierId: userId },
          { account: 'PROVIDER_CLEARING', amountTiyin: -amount },
        ],
        { kind: amount > 0n ? 'courier_payout' : 'courier_cash_in' },
      );
      await this.audit.record(
        {
          action: 'courier.settlement',
          entityType: 'CourierSettlement',
          entityId: settlement.id,
          actorId,
          metadata: { courierId: userId, amountTiyin: amount.toString() },
          ...meta,
        },
        tx,
      );
      return before - amount;
    });
    return { balanceTiyin: balance.toString() };
  }
}
