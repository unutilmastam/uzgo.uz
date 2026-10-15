import { describe, expect, it } from 'vitest';
import { courierFeeTiyin, distanceM, etaMinutes, isOpenAt } from './geo.js';

const termiz = { lat: 37.2242, lng: 67.2783 };

describe('geo', () => {
  it('measures straight-line distance', () => {
    expect(distanceM(termiz, termiz)).toBe(0);
    // ~1.11 km per 0.01° of latitude.
    expect(Math.round(distanceM(termiz, { lat: 37.2342, lng: 67.2783 }))).toBe(1112);
    // Termiz → Tashkent is roughly 470 km in a straight line.
    const km = distanceM(termiz, { lat: 41.3111, lng: 69.2797 }) / 1000;
    expect(km).toBeGreaterThan(450);
    expect(km).toBeLessThan(500);
  });

  it('prices courier delivery in whole 100 soʻm', () => {
    const tariff = { baseTiyin: 800_000n, perKmTiyin: 200_000n };
    expect(courierFeeTiyin(0, tariff)).toBe(800_000n);
    // 2 km straight → 2.6 km road → 8 000 + 5 200 = 13 200 soʻm.
    expect(courierFeeTiyin(2000, tariff)).toBe(1_320_000n);
    expect(courierFeeTiyin(2001, tariff) % 10_000n).toBe(0n);
  });

  it('estimates delivery time in 5-minute steps', () => {
    expect(etaMinutes(25, 0)).toBe(30);
    expect(etaMinutes(25, 3000) % 5).toBe(0);
  });

  it('checks opening hours in Tashkent time, including past midnight', () => {
    // 2026-10-19 is a Monday (day 0). 12:00 Tashkent = 07:00 UTC.
    const mondayNoon = new Date('2026-10-19T07:00:00Z');
    expect(isOpenAt([{ day: 0, open: '09:00', close: '23:00' }], mondayNoon)).toBe(true);
    expect(isOpenAt([{ day: 1, open: '09:00', close: '23:00' }], mondayNoon)).toBe(false);
    expect(isOpenAt([{ day: 0, open: '13:00', close: '23:00' }], mondayNoon)).toBe(false);
    // Sunday 18:00–02:00 still open at Monday 01:00 Tashkent (Sunday 20:00 UTC).
    const late = new Date('2026-10-18T20:00:00Z');
    expect(isOpenAt([{ day: 6, open: '18:00', close: '02:00' }], late)).toBe(true);
    expect(isOpenAt([{ day: 0, open: '00:00', close: '00:00' }], mondayNoon)).toBe(true);
  });
});
