import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type AdminPromo,
  type CreatePromo,
  createPromoSchema,
  type UpdatePromo,
  updatePromoSchema,
} from '@uzgo/contracts';
import type { Request } from 'express';
import { metaOf } from '../admin/meta.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentAuth, RequireStaffTotp, Roles } from '../auth/decorators.js';
import { AppException } from '../common/http-exception.filter.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Prisma } from '../generated/prisma/client.js';
import { Role } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

const uuid = new ParseUUIDPipe({ version: '7' });
const MAX_PROMO_CODES = 500;

type PromoRow = Prisma.PromoCodeGetPayload<object>;

/**
 * Promo codes are UZGO's money (ADR 0023): admins only, second factor, every
 * change audited. Discount terms are fixed at creation.
 */
@ApiTags('admin')
@Controller('admin/promo-codes')
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@RequireStaffTotp()
export class AdminPromoController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(): Promise<{ items: AdminPromo[] }> {
    const rows = await this.prisma.promoCode.findMany({
      orderBy: { createdAt: 'desc' },
      take: MAX_PROMO_CODES,
    });
    const usage = await this.prisma.order.groupBy({
      by: ['promoCodeId'],
      where: { promoCodeId: { in: rows.map((r) => r.id) }, status: { not: 'CANCELLED' } },
      orderBy: { promoCodeId: 'asc' },
      _count: { _all: true },
      _sum: { discountTiyin: true },
    });
    const byId = new Map(usage.map((u) => [u.promoCodeId, u]));
    return {
      items: rows.map((row) => {
        const u = byId.get(row.id);
        const count = u && typeof u._count === 'object' ? u._count._all : 0;
        return this.view(row, count, u?._sum.discountTiyin ?? 0n);
      }),
    };
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(createPromoSchema)) body: CreatePromo,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<{ promo: AdminPromo }> {
    if ((await this.prisma.promoCode.count()) >= MAX_PROMO_CODES) {
      throw new AppException(HttpStatus.CONFLICT, 'PROMO_LIMIT', 'Too many promo codes');
    }
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.promoCode.create({
          data: {
            code: body.code,
            kind: body.kind,
            percentBp: body.kind === 'PERCENT' ? (body.percentBp ?? null) : null,
            amountTiyin: body.amountTiyin ? BigInt(body.amountTiyin) : null,
            maxDiscountTiyin: body.maxDiscountTiyin ? BigInt(body.maxDiscountTiyin) : null,
            minOrderTiyin: BigInt(body.minOrderTiyin),
            startsAt: body.startsAt ? new Date(body.startsAt) : null,
            endsAt: body.endsAt ? new Date(body.endsAt) : null,
            usageLimit: body.usageLimit ?? null,
            perUserLimit: body.perUserLimit,
            description: body.description ?? null,
            createdById: auth.user.id,
          },
        });
        await this.audit.record(
          {
            action: 'promo.created',
            entityType: 'PromoCode',
            entityId: created.id,
            actorId: auth.user.id,
            metadata: {
              code: created.code,
              kind: created.kind,
              percentBp: created.percentBp,
              amountTiyin: created.amountTiyin?.toString() ?? null,
              maxDiscountTiyin: created.maxDiscountTiyin?.toString() ?? null,
              usageLimit: created.usageLimit,
            },
            ...metaOf(req),
          },
          tx,
        );
        return created;
      });
      return { promo: this.view(row, 0, 0n) };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppException(HttpStatus.CONFLICT, 'PROMO_CODE_TAKEN', 'This code already exists');
      }
      throw err;
    }
  }

  @Patch(':id')
  async update(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updatePromoSchema)) body: UpdatePromo,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<{ promo: AdminPromo }> {
    const row = await this.prisma.$transaction(async (tx) => {
      const current = await tx.promoCode.findUnique({ where: { id } });
      if (!current) throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Not found');
      const endsAt =
        body.endsAt === undefined ? undefined : body.endsAt === null ? null : new Date(body.endsAt);
      if (endsAt && current.startsAt && endsAt <= current.startsAt) {
        throw new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Invalid end date', [
          { path: 'endsAt', message: 'Must be after startsAt' },
        ]);
      }
      const updated = await tx.promoCode.update({
        where: { id },
        data: {
          ...(body.active === undefined ? {} : { active: body.active }),
          ...(endsAt === undefined ? {} : { endsAt }),
          ...(body.usageLimit === undefined ? {} : { usageLimit: body.usageLimit }),
          ...(body.description === undefined ? {} : { description: body.description }),
        },
      });
      await this.audit.record(
        {
          action: 'promo.updated',
          entityType: 'PromoCode',
          entityId: id,
          actorId: auth.user.id,
          metadata: {
            code: updated.code,
            ...(body.active === undefined ? {} : { active: body.active }),
            ...(endsAt === undefined ? {} : { endsAt: endsAt?.toISOString() ?? null }),
            ...(body.usageLimit === undefined ? {} : { usageLimit: body.usageLimit }),
          },
          ...metaOf(req),
        },
        tx,
      );
      return updated;
    });
    const used = await this.prisma.order.aggregate({
      where: { promoCodeId: id, status: { not: 'CANCELLED' } },
      _count: { _all: true },
      _sum: { discountTiyin: true },
    });
    return { promo: this.view(row, used._count._all, used._sum.discountTiyin ?? 0n) };
  }

  private view(row: PromoRow, used: number, discountTotal: bigint): AdminPromo {
    return {
      id: row.id,
      code: row.code,
      kind: row.kind,
      percentBp: row.percentBp,
      amountTiyin: row.amountTiyin?.toString() ?? null,
      maxDiscountTiyin: row.maxDiscountTiyin?.toString() ?? null,
      minOrderTiyin: row.minOrderTiyin.toString(),
      startsAt: row.startsAt?.toISOString() ?? null,
      endsAt: row.endsAt?.toISOString() ?? null,
      usageLimit: row.usageLimit,
      perUserLimit: row.perUserLimit,
      active: row.active,
      description: row.description,
      used,
      discountTotalTiyin: discountTotal.toString(),
      createdAt: row.createdAt.toISOString(),
    };
  }
}
