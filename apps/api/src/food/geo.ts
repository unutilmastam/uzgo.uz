/** WGS 84 point. */
export type Point = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_000;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle (straight-line) distance in metres. */
export function distanceM(a: Point, b: Point): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Streets are longer than a straight line; a fixed factor keeps the estimate honest. */
export const ROAD_FACTOR = 1.3;

/**
 * UZGO courier fee (ADR 0024): base + per started 100 m of road distance,
 * rounded up to whole 100 soʻm (10 000 tiyin). Integer tiyin only.
 */
export function courierFeeTiyin(
  straightM: number,
  tariff: { baseTiyin: bigint; perKmTiyin: bigint },
): bigint {
  const roadHm = BigInt(Math.ceil((straightM * ROAD_FACTOR) / 100));
  const raw = tariff.baseTiyin + (tariff.perKmTiyin * roadHm) / 10n;
  const step = 10_000n;
  return ((raw + step - 1n) / step) * step;
}

/** Rough delivery time: cooking + road distance at ~20 km/h + 5 min handover, in minutes. */
export function etaMinutes(prepMinutes: number, straightM: number): number {
  const ride = (straightM * ROAD_FACTOR) / ((20 * 1000) / 60);
  return Math.ceil((prepMinutes + ride + 5) / 5) * 5;
}

export type OpeningHours = { day: number; open: string; close: string }[];

const TASHKENT_OFFSET_MIN = 5 * 60;
const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/**
 * Open at `now` in Tashkent time (UTC+5, no DST). Days are Monday = 0.
 * A closing time at or before the opening time runs past midnight
 * ("18:00–02:00"); "00:00–00:00" means open all day.
 */
export function isOpenAt(hours: OpeningHours, now: Date): boolean {
  const local = new Date(now.getTime() + TASHKENT_OFFSET_MIN * 60_000);
  const day = (local.getUTCDay() + 6) % 7;
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  return hours.some((slot) => {
    const open = minutesOf(slot.open);
    const close = minutesOf(slot.close);
    if (open === close) return slot.day === day;
    if (open < close) return slot.day === day && minute >= open && minute < close;
    // Past midnight: the evening part today, the early part tomorrow.
    return (slot.day === day && minute >= open) || ((slot.day + 1) % 7 === day && minute < close);
  });
}
