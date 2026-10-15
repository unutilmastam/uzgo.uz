import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  type DeliveryQuote,
  type PromoError,
  type PickupPoint,
  type SellerOrderStatus,
  deliveryQuoteQuerySchema,
  trackingSchema,
} from '@uzgo/contracts';
import type { Request } from 'express';
import { z } from 'zod';
import { metaOf } from '../admin/meta.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentAuth, Public, RequireStaffTotp, Roles } from '../auth/decorators.js';
import { isVariantSellable, variantSelect } from '../cart/cart.service.js';
import { AppException } from '../common/http-exception.filter.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Role } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type AppliedPromo, PromoException, PromoService } from '../promo/promo.service.js';
import { planDelivery } from './delivery.js';

type Names = { uz: string; ru: string };
const uuid = new ParseUUIDPipe({ version: '7' });
const notFound = (what: string) =>
  new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${what} not found`);

const pickupQuery = z.strictObject({ districtId: z.uuid() });

const zoneSchema = z
  .strictObject({
    feeTiyin: z.string().regex(/^\d{1,13}$/),
    freeFromTiyin: z
      .string()
      .regex(/^\d{1,13}$/)
      .refine((v) => BigInt(v) > 0n)
      .nullable(),
    etaDaysMin: z.number().int().min(0).max(60),
    etaDaysMax: z.number().int().min(0).max(60),
    active: z.boolean(),
  })
  .refine((v) => v.etaDaysMax >= v.etaDaysMin, {
    message: 'etaDaysMax < etaDaysMin',
    path: ['etaDaysMax'],
  });

const pointSchema = z.strictObject({
  districtId: z.uuid(),
  name: z.strictObject({
    uz: z.string().trim().min(2).max(100),
    ru: z.string().trim().min(2).max(100),
  }),
  address: z.string().trim().min(5).max(200),
  hours: z.string().trim().max(100).nullable(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s()-]{7,20}$/)
    .nullable(),
  active: z.boolean(),
});

const toPoint = (p: {
  id: string;
  districtId: string;
  name: unknown;
  address: string;
  hours: string | null;
  phone: string | null;
}): PickupPoint => ({
  id: p.id,
  districtId: p.districtId,
  name: p.name as Names,
  address: p.address,
  hours: p.hours,
  phone: p.phone,
});

/** Delivery prices and pickup points for checkout. */
@ApiTags('delivery')
@Controller('delivery')
export class DeliveryController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly promo: PromoService,
  ) {}

  @Public()
  @Get('pickup-points')
  async pickupPoints(
    @Query(new ZodValidationPipe(pickupQuery)) query: z.infer<typeof pickupQuery>,
  ): Promise<{ items: PickupPoint[] }> {
    const rows = await this.prisma.pickupPoint.findMany({
      where: { districtId: query.districtId, active: true },
      orderBy: { createdAt: 'asc' },
    });
    return { items: rows.map(toPoint) };
  }

  /**
   * Delivery price and promo discount for the caller's cart — the same rules
   * checkout applies. Throttled more tightly: it also answers whether a promo
   * code exists, so it must not become a code-guessing oracle.
   */
  @Get('quote')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async quote(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodValidationPipe(deliveryQuoteQuerySchema))
    query: z.output<typeof deliveryQuoteQuerySchema>,
  ): Promise<DeliveryQuote> {
    const cart = await this.prisma.cart.findUnique({
      where: { userId: auth.user.id },
      select: { items: { select: { quantity: true, variant: { select: variantSelect } } } },
    });
    const lines = (cart?.items ?? []).filter((l) => isVariantSellable(l.variant));
    let plan;
    try {
      plan = await planDelivery(this.prisma, {
        districtId: query.districtId,
        type: query.type,
        pickupPointId: query.pickupPointId,
      });
    } catch (e) {
      if (e instanceof AppException && e.code === 'DELIVERY_UNAVAILABLE') {
        return {
          available: false,
          etaDays: null,
          shipments: [],
          itemsTotalTiyin: '0',
          deliveryTotalTiyin: '0',
          discountTiyin: '0',
          totalTiyin: '0',
          promo: null,
          promoError: null,
          promoMinOrderTiyin: null,
        };
      }
      throw e;
    }
    const byStore = Map.groupBy(lines, (l) => l.variant.product.store.id);
    const shipments = [...byStore.entries()].map(([storeId, storeLines]) => {
      const items = storeLines.reduce((s, l) => s + l.variant.priceTiyin * BigInt(l.quantity), 0n);
      return { storeId, items, delivery: plan.feeFor(items) };
    });
    const items = shipments.reduce((s, x) => s + x.items, 0n);
    const delivery = shipments.reduce((s, x) => s + x.delivery, 0n);
    // Same promo rules as checkout (without the lock: nothing is reserved here).
    let promo: AppliedPromo | null = null;
    let promoError: PromoError | null = null;
    let promoMinOrderTiyin: string | null = null;
    if (query.promoCode) {
      try {
        promo = await this.promo.evaluate(auth.user.id, query.promoCode, items);
      } catch (e) {
        if (!(e instanceof PromoException)) throw e;
        promoError = e.promoError;
        promoMinOrderTiyin = e.minOrderTiyin?.toString() ?? null;
      }
    }
    const discount = promo?.discountTiyin ?? 0n;
    return {
      available: true,
      etaDays: plan.etaDays,
      shipments: shipments.map((x) => ({
        storeId: x.storeId,
        itemsTotalTiyin: x.items.toString(),
        deliveryTiyin: x.delivery.toString(),
      })),
      itemsTotalTiyin: items.toString(),
      deliveryTotalTiyin: delivery.toString(),
      discountTiyin: discount.toString(),
      totalTiyin: (items + delivery - discount).toString(),
      promo: promo ? { code: promo.code, description: promo.description } : null,
      promoError,
      promoMinOrderTiyin,
    };
  }
}

/** Shipment tracking set by the store team. */
@ApiTags('seller')
@Controller('seller/seller-orders')
export class SellerTrackingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Patch(':id/tracking')
  async setTracking(
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(trackingSchema)) body: z.infer<typeof trackingSchema>,
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    const shipment = await this.prisma.sellerOrder.findFirst({
      where: { id, store: { members: { some: { userId: auth.user.id } } } },
      select: { id: true, status: true },
    });
    if (!shipment) throw notFound('Shipment');
    const open: SellerOrderStatus[] = ['ACCEPTED', 'PACKED', 'HANDED_TO_DELIVERY'];
    if (!open.includes(shipment.status)) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'INVALID_STATE_TRANSITION',
        'Tracking cannot change now',
      );
    }
    await this.prisma.sellerOrder.update({
      where: { id },
      data: { carrier: body.carrier, trackingCode: body.trackingCode },
    });
    await this.audit.record({
      action: 'shipment.tracking_set',
      entityType: 'SellerOrder',
      entityId: id,
      actorId: auth.user.id,
      ...metaOf(req),
    });
    return { ok: true };
  }
}

/** Delivery tariffs and pickup points (admins with TOTP). */
@ApiTags('admin')
@Controller('admin/delivery')
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@RequireStaffTotp()
export class AdminDeliveryController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Every district of a region with its zone (or null). */
  @Get('zones')
  async zones(
    @Query(new ZodValidationPipe(z.strictObject({ regionId: z.uuid() })))
    query: {
      regionId: string;
    },
  ) {
    const districts = await this.prisma.district.findMany({
      where: { regionId: query.regionId },
      orderBy: { sort: 'asc' },
      select: { id: true, name: true, deliveryZone: true },
    });
    return {
      items: districts.map((d) => ({
        districtId: d.id,
        name: d.name as Names,
        zone: d.deliveryZone
          ? {
              feeTiyin: d.deliveryZone.feeTiyin.toString(),
              freeFromTiyin: d.deliveryZone.freeFromTiyin?.toString() ?? null,
              etaDaysMin: d.deliveryZone.etaDaysMin,
              etaDaysMax: d.deliveryZone.etaDaysMax,
              active: d.deliveryZone.active,
            }
          : null,
      })),
    };
  }

  @Put('zones/:districtId')
  async setZone(
    @CurrentAuth() auth: AuthContext,
    @Param('districtId', uuid) districtId: string,
    @Body(new ZodValidationPipe(zoneSchema)) body: z.infer<typeof zoneSchema>,
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    if (
      !(await this.prisma.district.findUnique({ where: { id: districtId }, select: { id: true } }))
    ) {
      throw notFound('District');
    }
    const data = {
      feeTiyin: BigInt(body.feeTiyin),
      freeFromTiyin: body.freeFromTiyin === null ? null : BigInt(body.freeFromTiyin),
      etaDaysMin: body.etaDaysMin,
      etaDaysMax: body.etaDaysMax,
      active: body.active,
    };
    await this.prisma.deliveryZone.upsert({
      where: { districtId },
      create: { districtId, ...data },
      update: data,
    });
    await this.audit.record({
      action: 'delivery.zone_set',
      entityType: 'District',
      entityId: districtId,
      actorId: auth.user.id,
      metadata: { ...body },
      ...metaOf(req),
    });
    return { ok: true };
  }

  @Get('pickup-points')
  async points(): Promise<{ items: (PickupPoint & { active: boolean })[] }> {
    const rows = await this.prisma.pickupPoint.findMany({ orderBy: { createdAt: 'asc' } });
    return { items: rows.map((p) => ({ ...toPoint(p), active: p.active })) };
  }

  @Post('pickup-points')
  async createPoint(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(pointSchema)) body: z.infer<typeof pointSchema>,
    @Req() req: Request,
  ): Promise<{ point: PickupPoint }> {
    const point = await this.prisma.pickupPoint.create({ data: body });
    await this.audit.record({
      action: 'delivery.pickup_point_created',
      entityType: 'PickupPoint',
      entityId: point.id,
      actorId: auth.user.id,
      ...metaOf(req),
    });
    return { point: toPoint(point) };
  }

  @Patch('pickup-points/:id')
  async updatePoint(
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(pointSchema.partial())) body: Partial<z.infer<typeof pointSchema>>,
    @Req() req: Request,
  ): Promise<{ point: PickupPoint }> {
    const exists = await this.prisma.pickupPoint.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw notFound('Pickup point');
    const point = await this.prisma.pickupPoint.update({ where: { id }, data: body });
    await this.audit.record({
      action: 'delivery.pickup_point_updated',
      entityType: 'PickupPoint',
      entityId: id,
      actorId: auth.user.id,
      metadata: { fields: Object.keys(body) },
      ...metaOf(req),
    });
    return { point: toPoint(point) };
  }
}
