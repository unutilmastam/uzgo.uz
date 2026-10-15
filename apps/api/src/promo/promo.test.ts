import { describe, expect, it } from 'vitest';
import { allocate, discountFor } from './promo.js';

const percent = (bp: number, max: bigint | null = null) => ({
  kind: 'PERCENT' as const,
  percentBp: bp,
  amountTiyin: null,
  maxDiscountTiyin: max,
});
const fixed = (amount: bigint) => ({
  kind: 'FIXED' as const,
  percentBp: null,
  amountTiyin: amount,
  maxDiscountTiyin: null,
});

describe('discountFor', () => {
  it('rounds percentages down and applies the cap', () => {
    expect(discountFor(percent(1000), 12_345n)).toBe(1_234n);
    expect(discountFor(percent(1000, 1_000n), 12_345n)).toBe(1_000n);
    expect(discountFor(percent(9000), 1n)).toBe(0n);
  });

  it('never discounts more than the items', () => {
    expect(discountFor(fixed(50_000n), 30_000n)).toBe(30_000n);
    expect(discountFor(fixed(5_000n), 30_000n)).toBe(5_000n);
    expect(discountFor(fixed(5_000n), 0n)).toBe(0n);
  });
});

describe('allocate', () => {
  it('splits exactly and proportionally', () => {
    expect(allocate(100n, [100n, 100n, 100n])).toEqual([34n, 33n, 33n]);
    expect(allocate(1_000n, [3_000n, 1_000n])).toEqual([750n, 250n]);
    expect(allocate(0n, [5n, 5n])).toEqual([0n, 0n]);
  });

  it('never gives a line more than its weight', () => {
    for (let total = 0n; total <= 12n; total += 1n) {
      const parts = allocate(total, [1n, 1n, 10n]);
      expect(parts.reduce((a, b) => a + b, 0n)).toBe(total);
      expect(parts[0]).toBeLessThanOrEqual(1n);
      expect(parts[1]).toBeLessThanOrEqual(1n);
    }
  });

  it('rejects a total above the weights', () => {
    expect(() => allocate(3n, [1n, 1n])).toThrow();
  });
});
