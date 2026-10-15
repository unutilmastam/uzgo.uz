import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { CourierJob, CourierMe } from '@uzgo/contracts';
import { AppException } from '../common/http-exception.filter.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { SellerOrderStatus } from '../generated/prisma/enums.js';
import { allowedFor, transitionInTx } from '../orders/orders.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { courierBalance } from './couriers.service.js';
import { distanceM, type Point } from './geo.js';

type Names = { uz: string; ru: string };

/** A courier carries at most this many orders at once. */
export const MAX_ACTIVE_JOBS = 3;
const ACTIVE: SellerOrderStatus[] = ['ACCEPTED', 'PACKED', 'HANDED_TO_DELIVERY'];

const jobSelect = {
  id: true,
  status: true,
  courierId: true,
  courierFeeTiyin: true,
  readyAt: true,
  store: {
    select: {
      name: true,
      restaurant: { select: { address: true, phone: true, lat: true, lng: true } },
    },
  },
  order: {
    select: {
      number: true,
      paymentMethod: true,
      totalTiyin: true,
      recipientName: true,
      recipientPhone: true,
      addressLine: true,
      comment: true,
      deliveryLat: true,
      deliveryLng: true,
    },
  },
} satisfies Prisma.SellerOrderSelect;
type JobRow = Prisma.SellerOrderGetPayload<{ select: typeof jobSelect }>;

const forbidden = (code: string, message: string) =>
  new AppException(HttpStatus.FORBIDDEN, code, message);

/**
 * Courier mode of the app (ADR 0024). Offers are UZGO-delivery food orders
 * that are cooking or ready, without a courier, near the courier's last
 * position. Customer details are shown only to the courier who took the job.
 */
@Injectable()
export class CourierService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private async profile(userId: string) {
    const profile = await this.prisma.courierProfile.findUnique({ where: { userId } });
    if (!profile) throw forbidden('NOT_A_COURIER', 'This account is not a courier');
    if (profile.status !== 'ACTIVE') {
      throw forbidden('COURIER_SUSPENDED', 'The courier account is suspended');
    }
    return profile;
  }

  private job(row: JobRow, courierId: string, from: Point | null): CourierJob {
    const r = row.store.restaurant;
    const o = row.order;
    const restaurant = r ?? { address: '', phone: null, lat: 0, lng: 0 };
    const destination = { lat: o.deliveryLat ?? 0, lng: o.deliveryLng ?? 0 };
    const mine = row.courierId === courierId;
    return {
      id: row.id,
      orderNumber: o.number,
      status: row.status,
      restaurant: { name: row.store.name as Names, ...restaurant },
      customer: mine
        ? {
            name: o.recipientName,
            phone: o.recipientPhone,
            addressLine: o.addressLine,
            comment: o.comment,
            ...destination,
          }
        : null,
      distanceM: Math.round(distanceM(restaurant, destination)),
      toRestaurantM: from ? Math.round(distanceM(from, restaurant)) : null,
      feeTiyin: row.courierFeeTiyin.toString(),
      collectTiyin: o.paymentMethod === 'CASH_ON_DELIVERY' ? o.totalTiyin.toString() : null,
      readyAt: row.readyAt?.toISOString() ?? null,
      allowedTransitions: mine
        ? allowedFor(row.status, 'COURIER', 'FOOD').filter(
            (to) => to !== 'HANDED_TO_DELIVERY' || row.status === 'PACKED',
          )
        : [],
    };
  }

  async me(userId: string): Promise<CourierMe> {
    const profile = await this.profile(userId);
    const rows = await this.prisma.sellerOrder.findMany({
      where: { courierId: userId, status: { in: ACTIVE } },
      orderBy: { courierAssignedAt: 'asc' },
      select: jobSelect,
    });
    const from =
      profile.lastLat !== null && profile.lastLng !== null
        ? { lat: profile.lastLat, lng: profile.lastLng }
        : null;
    return {
      status: profile.status,
      vehicle: profile.vehicle,
      online: profile.online,
      balanceTiyin: (await courierBalance(this.prisma, userId)).toString(),
      active: rows.map((r) => this.job(r, userId, from)),
    };
  }

  async setStatus(userId: string, input: { online: boolean; lat?: number; lng?: number }) {
    await this.profile(userId);
    if (input.online && (input.lat === undefined || input.lng === undefined)) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'LOCATION_REQUIRED',
        'Share your location to go online',
      );
    }
    await this.prisma.courierProfile.update({
      where: { userId },
      data: {
        online: input.online,
        ...(input.lat !== undefined && input.lng !== undefined
          ? { lastLat: input.lat, lastLng: input.lng, lastSeenAt: new Date() }
          : {}),
      },
    });
    return this.me(userId);
  }

  async location(userId: string, point: Point) {
    await this.profile(userId);
    await this.prisma.courierProfile.update({
      where: { userId },
      data: { lastLat: point.lat, lastLng: point.lng, lastSeenAt: new Date() },
    });
  }

  async offers(userId: string): Promise<{ items: CourierJob[] }> {
    const profile = await this.profile(userId);
    if (!profile.online || profile.lastLat === null || profile.lastLng === null) {
      return { items: [] };
    }
    const from = { lat: profile.lastLat, lng: profile.lastLng };
    const radiusM = this.env.FOOD_OFFER_RADIUS_KM * 1000;
    const dLat = radiusM / 111_000;
    const dLng = radiusM / (111_000 * Math.cos((from.lat * Math.PI) / 180));
    const rows = await this.prisma.sellerOrder.findMany({
      where: {
        courierId: null,
        status: { in: ['ACCEPTED', 'PACKED'] },
        order: { kind: 'FOOD', foodDeliveryMode: 'UZGO' },
        store: {
          restaurant: {
            lat: { gte: from.lat - dLat, lte: from.lat + dLat },
            lng: { gte: from.lng - dLng, lte: from.lng + dLng },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
      select: jobSelect,
    });
    const items = rows
      .map((r) => this.job(r, userId, from))
      .filter((j) => (j.toRestaurantM ?? Infinity) <= radiusM)
      .sort((a, b) => (a.toRestaurantM ?? 0) - (b.toRestaurantM ?? 0))
      .slice(0, 20);
    return { items };
  }

  /** First courier wins: a conditional update, so two couriers can never both take a job. */
  async accept(userId: string, sellerOrderId: string): Promise<CourierMe> {
    const profile = await this.profile(userId);
    if (!profile.online) throw forbidden('COURIER_OFFLINE', 'Go online to take orders');
    const busy = await this.prisma.sellerOrder.count({
      where: { courierId: userId, status: { in: ACTIVE } },
    });
    if (busy >= MAX_ACTIVE_JOBS) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'TOO_MANY_JOBS',
        'Deliver your current orders first',
      );
    }
    const taken = await this.prisma.sellerOrder.updateMany({
      where: {
        id: sellerOrderId,
        courierId: null,
        status: { in: ['ACCEPTED', 'PACKED'] },
        order: { kind: 'FOOD', foodDeliveryMode: 'UZGO' },
      },
      data: { courierId: userId, courierAssignedAt: new Date() },
    });
    if (taken.count === 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'OFFER_TAKEN',
        'This order is no longer available',
      );
    }
    return this.me(userId);
  }

  async transition(
    userId: string,
    sellerOrderId: string,
    to: 'HANDED_TO_DELIVERY' | 'DELIVERED' | 'DELIVERY_FAILED',
    reason: string | undefined,
  ): Promise<CourierMe> {
    await this.profile(userId);
    const mine = await this.prisma.sellerOrder.findFirst({
      where: { id: sellerOrderId, courierId: userId },
      select: { id: true },
    });
    if (!mine) throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Order not found');
    await this.prisma.$transaction((tx) =>
      transitionInTx(tx, sellerOrderId, to, { actor: 'COURIER', userId, reason }),
    );
    return this.me(userId);
  }
}
