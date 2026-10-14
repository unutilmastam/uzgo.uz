import { describe, expect, it } from 'vitest';
import { createVariantSchema, updateVariantSchema } from './seller.js';

const variant = { sku: 'A-1', priceTiyin: '100', stock: 1 };

describe('seller contracts', () => {
  it('accepts positive integer tiyin strings only (no floats, no throw)', () => {
    expect(createVariantSchema.safeParse(variant).success).toBe(true);
    for (const priceTiyin of ['0', '12.5', '1e5', '-1', '', '99999999999999', 100]) {
      expect(createVariantSchema.safeParse({ ...variant, priceTiyin }).success).toBe(false);
    }
  });

  it('refuses stock and stockAdjust together, and unknown fields', () => {
    expect(updateVariantSchema.safeParse({ stock: 1, stockAdjust: 1 }).success).toBe(false);
    expect(updateVariantSchema.safeParse({ storeId: 'x' }).success).toBe(false);
    expect(updateVariantSchema.safeParse({}).success).toBe(false);
  });
});
