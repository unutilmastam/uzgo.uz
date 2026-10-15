/** Discount terms of one promo code (ADR 0023). */
export type PromoTerms = {
  kind: 'PERCENT' | 'FIXED';
  percentBp: number | null;
  amountTiyin: bigint | null;
  maxDiscountTiyin: bigint | null;
};

/**
 * Discount on the items total: PERCENT rounds down (in the customer's
 * disfavour by under one tiyin, never in UZGO's loss), capped by the maximum;
 * FIXED never exceeds the items. Delivery is never discounted.
 */
export function discountFor(terms: PromoTerms, itemsTotal: bigint): bigint {
  if (itemsTotal <= 0n) return 0n;
  let discount =
    terms.kind === 'PERCENT'
      ? (itemsTotal * BigInt(terms.percentBp ?? 0)) / 10_000n
      : (terms.amountTiyin ?? 0n);
  if (terms.maxDiscountTiyin !== null && discount > terms.maxDiscountTiyin) {
    discount = terms.maxDiscountTiyin;
  }
  if (discount > itemsTotal) discount = itemsTotal;
  return discount < 0n ? 0n : discount;
}

/**
 * Splits `total` over `weights` in proportion (largest remainder): parts sum
 * to `total` exactly and no part exceeds its weight (total ≤ sum of weights).
 * Ties go to the earlier line, so the split is deterministic.
 */
export function allocate(total: bigint, weights: readonly bigint[]): bigint[] {
  const sum = weights.reduce((a, b) => a + b, 0n);
  if (total <= 0n || sum <= 0n) return weights.map(() => 0n);
  if (total > sum) throw new Error('allocate: total exceeds the weights');
  const parts = weights.map((w) => (total * w) / sum);
  let left = total - parts.reduce((a, b) => a + b, 0n);
  const order = weights
    .map((w, i) => ({ i, rem: (total * w) % sum }))
    .sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1));
  for (const { i } of order) {
    if (left === 0n) break;
    const weight = weights[i] ?? 0n;
    if ((parts[i] ?? 0n) < weight) {
      parts[i] = (parts[i] ?? 0n) + 1n;
      left -= 1n;
    }
  }
  return parts;
}
