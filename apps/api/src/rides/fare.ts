import type { Env } from '../config/env.js';
import type { RideClass } from '../generated/prisma/enums.js';
import { ROAD_FACTOR } from '../food/geo.js';

export type RideTariff = { baseTiyin: bigint; perKmTiyin: bigint };

/** Fixed prices are rounded up to whole 500 soʻm. */
const PRICE_STEP_TIYIN = 50_000n;

/**
 * Fixed ride price (ADR 0025): base + per started 100 m of road distance
 * (straight line × ROAD_FACTOR), rounded up to 500 soʻm. Integer tiyin only.
 */
export function rideFareTiyin(straightM: number, tariff: RideTariff): bigint {
  const roadHm = BigInt(Math.ceil((straightM * ROAD_FACTOR) / 100));
  const raw = tariff.baseTiyin + (tariff.perKmTiyin * roadHm) / 10n;
  return ((raw + PRICE_STEP_TIYIN - 1n) / PRICE_STEP_TIYIN) * PRICE_STEP_TIYIN;
}

/** Trip time at ~25 km/h average city speed, at least 3 minutes. */
export function rideEtaMinutes(straightM: number): number {
  const minutes = (straightM * ROAD_FACTOR) / ((25 * 1000) / 60);
  return Math.max(3, Math.ceil(minutes));
}

/** UZGO commission: floor(price × bp / 10 000) — rounding favours the driver. */
export function rideCommissionTiyin(priceTiyin: bigint, bp: number): bigint {
  return (priceTiyin * BigInt(bp)) / 10_000n;
}

export function tariffFor(env: Env, rideClass: RideClass): RideTariff {
  return rideClass === 'COMFORT'
    ? {
        baseTiyin: BigInt(env.RIDE_COMFORT_BASE_TIYIN),
        perKmTiyin: BigInt(env.RIDE_COMFORT_PER_KM_TIYIN),
      }
    : {
        baseTiyin: BigInt(env.RIDE_ECONOMY_BASE_TIYIN),
        perKmTiyin: BigInt(env.RIDE_ECONOMY_PER_KM_TIYIN),
      };
}

/** Classes a driver of `driverClass` may serve: comfort cars also take economy rides. */
export function servedClasses(driverClass: RideClass): RideClass[] {
  return driverClass === 'COMFORT' ? ['ECONOMY', 'COMFORT'] : ['ECONOMY'];
}

/** A bounding box around `p` of `radiusM` (cheap pre-filter; exact distance afterwards). */
export function boxAround(p: { lat: number; lng: number }, radiusM: number) {
  const dLat = radiusM / 111_000;
  const dLng = radiusM / (111_000 * Math.cos((p.lat * Math.PI) / 180));
  return {
    lat: { gte: p.lat - dLat, lte: p.lat + dLat },
    lng: { gte: p.lng - dLng, lte: p.lng + dLng },
  };
}
