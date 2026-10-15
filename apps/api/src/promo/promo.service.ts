import { HttpStatus, Injectable } from '@nestjs/common';
import type { PromoError } from '@uzgo/contracts';
import { AppException } from '../common/http-exception.filter.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { discountFor } from './promo.js';

type Db = Prisma.TransactionClient | PrismaService;

export type AppliedPromo = {
  id: string;
  code: string;
  description: string | null;
  discountTiyin: bigint;
};

export class PromoException extends AppException {
  constructor(
    readonly promoError: PromoError,
    readonly minOrderTiyin: bigint | null = null,
  ) {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      promoError,
      'This promo code cannot be used',
      minOrderTiyin === null ? undefined : { minOrderTiyin: minOrderTiyin.toString() },
    );
  }
}

type PromoRow = {
  id: string;
  code: string;
  kind: 'PERCENT' | 'FIXED';
  percentBp: number | null;
  amountTiyin: bigint | null;
  maxDiscountTiyin: bigint | null;
  minOrderTiyin: bigint;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  perUserLimit: number;
  active: boolean;
  description: string | null;
};

/**
 * Checks a promo code for a customer and an items total (ADR 0023). With
 * `lock`, the code row is locked (FOR UPDATE) so concurrent checkouts using
 * the same code are counted one after another and limits cannot be exceeded.
 */
@Injectable()
export class PromoService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(
    userId: string,
    code: string,
    itemsTotal: bigint,
    options: { tx?: Prisma.TransactionClient; lock?: boolean } = {},
  ): Promise<AppliedPromo> {
    const db: Db = options.tx ?? this.prisma;
    const rows = options.lock
      ? await db.$queryRaw<PromoRow[]>`
          SELECT "id", "code", "kind", "percentBp", "amountTiyin", "maxDiscountTiyin",
                 "minOrderTiyin", "startsAt", "endsAt", "usageLimit", "perUserLimit",
                 "active", "description"
          FROM "PromoCode" WHERE "code" = ${code} FOR UPDATE`
      : await db.promoCode.findMany({ where: { code } });
    const promo = rows[0];
    if (!promo?.active) throw new PromoException('PROMO_INVALID');
    const now = Date.now();
    if (
      (promo.startsAt && promo.startsAt.getTime() > now) ||
      (promo.endsAt && promo.endsAt.getTime() <= now)
    ) {
      throw new PromoException('PROMO_EXPIRED');
    }
    if (itemsTotal < promo.minOrderTiyin) {
      throw new PromoException('PROMO_MIN_ORDER', promo.minOrderTiyin);
    }
    // Cancelled orders (including unpaid ones that expired) give the use back.
    const used = { promoCodeId: promo.id, status: { not: 'CANCELLED' as const } };
    // Sequential: one connection inside a transaction.
    const total = promo.usageLimit === null ? 0 : await db.order.count({ where: used });
    const mine = await db.order.count({ where: { ...used, userId } });
    if ((promo.usageLimit !== null && total >= promo.usageLimit) || mine >= promo.perUserLimit) {
      throw new PromoException('PROMO_LIMIT_REACHED');
    }
    const discountTiyin = discountFor(promo, itemsTotal);
    if (discountTiyin <= 0n) throw new PromoException('PROMO_MIN_ORDER', promo.minOrderTiyin);
    return { id: promo.id, code: promo.code, description: promo.description, discountTiyin };
  }
}
