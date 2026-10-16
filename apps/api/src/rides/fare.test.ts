import { describe, expect, it } from 'vitest';
import { rideCommissionTiyin, rideEtaMinutes, rideFareTiyin, servedClasses } from './fare.js';

const economy = { baseTiyin: 700_000n, perKmTiyin: 250_000n };

describe('ride fare', () => {
  it('charges base + road km and rounds up to 500 soʻm', () => {
    // 1 km straight = 1.3 km road = 13 × 100 m → 7 000 + 3 250 = 10 250 → 10 500 soʻm.
    expect(rideFareTiyin(1000, economy)).toBe(1_050_000n);
    // Zero distance still costs the base.
    expect(rideFareTiyin(0, economy)).toBe(700_000n);
    // Prices are always whole 500 soʻm.
    for (const m of [1, 333, 4_321, 77_777]) {
      expect(rideFareTiyin(m, economy) % 50_000n).toBe(0n);
    }
  });

  it('never lowers the price for a longer trip', () => {
    let last = 0n;
    for (let m = 0; m <= 30_000; m += 250) {
      const price = rideFareTiyin(m, economy);
      expect(price >= last).toBe(true);
      last = price;
    }
  });

  it('estimates time and commission in whole units', () => {
    expect(rideEtaMinutes(0)).toBe(3);
    expect(rideEtaMinutes(10_000)).toBe(32);
    expect(rideCommissionTiyin(1_050_000n, 1000)).toBe(105_000n);
    expect(rideCommissionTiyin(999n, 1000)).toBe(99n);
  });

  it('lets comfort cars take economy rides, not the other way round', () => {
    expect(servedClasses('COMFORT')).toEqual(['ECONOMY', 'COMFORT']);
    expect(servedClasses('ECONOMY')).toEqual(['ECONOMY']);
  });
});
