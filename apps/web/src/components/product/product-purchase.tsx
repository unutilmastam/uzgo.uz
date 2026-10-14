'use client';

import type { Variant } from '@uzgo/contracts';
import { VariantPicker } from './variant-picker';

/** Variant selection and (from Phase 4e) add to cart. */
export function ProductPurchase({ variants }: { variants: Variant[] }) {
  return <VariantPicker variants={variants} />;
}
