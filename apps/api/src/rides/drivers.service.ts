import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  DriverAction,
  DriverApplicationView,
  DriverJob,
  DriverMe,
  driverApplicationSchema,
} from '@uzgo/contracts';
import type { z } from 'zod';
import { AppException } from '../common/http-exception.filter.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { distanceM, type Point } from '../food/geo.js';
import { Prisma } from '../generated/prisma/client.js';
import type { RideStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { boxAround, servedClasses } from './fare.js';
import { ACTIVE_RIDE, transitionRide } from './ride-flow.js';

type Application = z.output<typeof driverApplicationSchema>;
type Db = Prisma.TransactionClient | PrismaService;

const jobSelect = {
  id: true,
  status: true,
  rideClass: true,
  driverId: true,
  pickupLat: true,
  pickupLng: true,
  pickupLabel: true,
  dropoffLat: true,
  dropoffLng: true,
  dropoffLabel: true,
  distanceM: true,
  priceTiyin: true,
  commissionTiyin: true,
  order: {
    select: {
      number: true,
      paymentMethod: true,
      recipientName: true,
      recipientPhone: true,
      comment: true,
    },
  },
} satisfies Prisma.RideSelect;
type JobRow = Prisma.RideGetPayload<{ select: typeof jobSelect }>;

/** Which button does what (ADR 0025). */
const ACTION_TARGET: Record<DriverAction, RideStatus> = {
  ARRIVED: 'ARRIVED',
  START: 'IN_PROGRESS',
  COMPLETE: 'COMPLETED',
  RELEASE: 'SEARCHING',
  NO_SHOW: 'CANCELLED',
};
const ACTIONS_FOR: Partial<Record<RideStatus, DriverAction[]>> = {
  ACCEPTED: ['ARRIVED', 'RELEASE'],
  ARRIVED: ['START', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETE'],
};

const forbidden = (code: string, message: string) =>
  new AppException(HttpStatus.FORBIDDEN, code, message);

/** What UZGO owes the driver (negative: commission the driver owes UZGO). */
export async function driverBalance(db: Db, driverId: string): Promise<bigint> {
  const sum = await db.ledgerEntry.aggregate({
    where: { account: 'DRIVER_PAYABLE', driverId },
    _sum: { amountTiyin: true },
  });
  return -(sum._sum.amountTiyin ?? 0n);
}

export function carOf(p: {
  carMake: string;
  carModel: string;
  carColor: string;
  carYear: number;
  plateNumber: string;
}) {
  return {
    make: p.carMake,
    model: p.carModel,
    color: p.carColor,
    year: p.carYear,
    plate: p.plateNumber,
  };
}

/**
 * Drivers (ADR 0025): anyone applies; staff approve. Approved drivers go
 * online and take requests near them. Rider details only after accepting.
 */
@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ─── Application ──────────────────────────────────────────────────────────

  async application(userId: string): Promise<{ application: DriverApplicationView | null }> {
    const p = await this.prisma.driverProfile.findUnique({ where: { userId } });
    if (!p) return { application: null };
    return {
      application: {
        status: p.status,
        firstName: p.firstName,
        lastName: p.lastName,
        licenceNumber: p.licenceNumber,
        permitNumber: p.permitNumber,
        taxId: p.taxId,
        car: carOf(p),
        rideClass: p.rideClass,
        reviewNote: p.reviewNote,
        createdAt: p.createdAt.toISOString(),
      },
    };
  }

  /** New application, or a corrected one after a rejection (back to PENDING). */
  async apply(userId: string, input: Application) {
    if (input.carYear > new Date().getUTCFullYear() + 1) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Check the car year', {
        issues: [{ path: ['carYear'], message: 'Car year is in the future' }],
      });
    }
    const existing = await this.prisma.driverProfile.findUnique({
      where: { userId },
      select: { status: true },
    });
    if (existing && (existing.status === 'ACTIVE' || existing.status === 'SUSPENDED')) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'APPLICATION_LOCKED',
        'Approved drivers change their details through UZGO staff',
      );
    }
    const data = {
      status: 'PENDING' as const,
      firstName: input.firstName,
      lastName: input.lastName,
      licenceNumber: input.licenceNumber,
      permitNumber: input.permitNumber || null,
      taxId: input.taxId ?? null,
      carMake: input.carMake,
      carModel: input.carModel,
      carColor: input.carColor,
      carYear: input.carYear,
      plateNumber: input.plateNumber,
      rideClass: input.rideClass,
      termsAcceptedAt: new Date(),
      reviewNote: null,
      reviewedById: null,
      reviewedAt: null,
    };
    try {
      await this.prisma.driverProfile.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppException(
          HttpStatus.CONFLICT,
          'PLATE_TAKEN',
          'Another driver already uses this plate number',
        );
      }
      throw err;
    }
    return this.application(userId);
  }

  // ─── Driver mode ──────────────────────────────────────────────────────────

  private async profile(userId: string) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId } });
    if (!profile || profile.status === 'PENDING' || profile.status === 'REJECTED') {
      throw forbidden('NOT_A_DRIVER', 'This account is not an approved driver');
    }
    if (profile.status !== 'ACTIVE') {
      throw forbidden('DRIVER_SUSPENDED', 'The driver account is suspended');
    }
    return profile;
  }

  private job(row: JobRow, driverId: string, from: Point | null): DriverJob {
    const mine = row.driverId === driverId;
    const pickup = { lat: row.pickupLat, lng: row.pickupLng };
    const cash = row.order.paymentMethod === 'CASH_ON_DELIVERY';
    return {
      id: row.id,
      number: row.order.number,
      status: row.status,
      rideClass: row.rideClass,
      pickup: { ...pickup, label: row.pickupLabel },
      dropoff: { lat: row.dropoffLat, lng: row.dropoffLng, label: row.dropoffLabel },
      distanceM: row.distanceM,
      toPickupM: from ? Math.round(distanceM(from, pickup)) : null,
      priceTiyin: row.priceTiyin.toString(),
      earningsTiyin: (row.priceTiyin - row.commissionTiyin).toString(),
      collectTiyin: cash ? row.priceTiyin.toString() : null,
      rider: mine
        ? {
            name: row.order.recipientName,
            phone: row.order.recipientPhone,
            comment: row.order.comment,
          }
        : null,
      allowedActions: mine ? (ACTIONS_FOR[row.status] ?? []) : [],
    };
  }

  async me(userId: string): Promise<DriverMe> {
    const profile = await this.profile(userId);
    const active = await this.prisma.ride.findFirst({
      where: { driverId: userId, status: { in: ACTIVE_RIDE } },
      select: jobSelect,
    });
    const from =
      profile.lastLat !== null && profile.lastLng !== null
        ? { lat: profile.lastLat, lng: profile.lastLng }
        : null;
    return {
      status: profile.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
      rideClass: profile.rideClass,
      online: profile.online,
      car: carOf(profile),
      balanceTiyin: (await driverBalance(this.prisma, userId)).toString(),
      active: active ? this.job(active, userId, from) : null,
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
    await this.prisma.driverProfile.update({
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
    await this.prisma.driverProfile.update({
      where: { userId },
      data: { lastLat: point.lat, lastLng: point.lng, lastSeenAt: new Date() },
    });
  }

  /** Rides looking for a driver near the driver's last position, nearest first. */
  async offers(userId: string): Promise<{ items: DriverJob[] }> {
    const profile = await this.profile(userId);
    if (!profile.online || profile.lastLat === null || profile.lastLng === null) {
      return { items: [] };
    }
    const from = { lat: profile.lastLat, lng: profile.lastLng };
    const radiusM = this.env.RIDE_OFFER_RADIUS_KM * 1000;
    const box = boxAround(from, radiusM);
    const rows = await this.prisma.ride.findMany({
      where: {
        status: 'SEARCHING',
        riderId: { not: userId },
        rideClass: { in: servedClasses(profile.rideClass) },
        pickupLat: box.lat,
        pickupLng: box.lng,
      },
      orderBy: { searchingAt: 'asc' },
      take: 50,
      select: jobSelect,
    });
    const items = rows
      .map((r) => this.job(r, userId, from))
      .filter((j) => (j.toPickupM ?? Infinity) <= radiusM)
      .sort((a, b) => (a.toPickupM ?? 0) - (b.toPickupM ?? 0))
      .slice(0, 20);
    return { items };
  }

  /** First driver wins: the ride row is locked, a second driver gets OFFER_TAKEN. */
  async accept(userId: string, rideId: string): Promise<DriverMe> {
    const profile = await this.profile(userId);
    if (!profile.online) throw forbidden('DRIVER_OFFLINE', 'Go online to take rides');
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      select: { riderId: true, rideClass: true },
    });
    if (!ride || ride.riderId === userId) {
      throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Ride not found');
    }
    if (!servedClasses(profile.rideClass).includes(ride.rideClass)) {
      throw forbidden('RIDE_CLASS_MISMATCH', 'This ride needs a higher class car');
    }
    const busy = await this.prisma.ride.count({
      where: { driverId: userId, status: { in: ACTIVE_RIDE } },
    });
    if (busy > 0) throw this.busy();
    try {
      await this.prisma.$transaction((tx) =>
        transitionRide(tx, rideId, 'ACCEPTED', { actor: 'DRIVER', userId }),
      );
    } catch (err) {
      if (err instanceof AppException && err.code === 'INVALID_TRANSITION') {
        throw new AppException(
          HttpStatus.CONFLICT,
          'OFFER_TAKEN',
          'This ride is no longer available',
        );
      }
      // The partial unique index: one active ride per driver, even under a race.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw this.busy();
      }
      throw err;
    }
    return this.me(userId);
  }

  private busy() {
    return new AppException(HttpStatus.CONFLICT, 'DRIVER_BUSY', 'Finish your current ride first');
  }

  async act(userId: string, rideId: string, action: DriverAction): Promise<DriverMe> {
    await this.profile(userId);
    const mine = await this.prisma.ride.findFirst({
      where: { id: rideId, driverId: userId },
      select: { id: true },
    });
    if (!mine) throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Ride not found');
    const reason =
      action === 'NO_SHOW' ? 'rider_no_show' : action === 'RELEASE' ? 'driver_released' : undefined;
    await this.prisma.$transaction((tx) =>
      transitionRide(tx, rideId, ACTION_TARGET[action], { actor: 'DRIVER', userId, reason }),
    );
    return this.me(userId);
  }
}
