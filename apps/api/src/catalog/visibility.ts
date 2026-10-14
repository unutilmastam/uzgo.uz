import type { Prisma } from '../generated/prisma/client.js';

/**
 * Storefront visibility (SPEC §10): approved, not deleted, from an active,
 * not deleted store, in an active category. Listings additionally require an
 * active variant in stock.
 */
export const visibleProductWhere = {
  status: 'APPROVED',
  deletedAt: null,
  store: { status: 'ACTIVE', deletedAt: null },
  category: { active: true },
} satisfies Prisma.ProductWhereInput;

export const inStockVariantWhere = {
  active: true,
  stock: { gt: 0 },
} satisfies Prisma.ProductVariantWhereInput;

/** Exact stock is not exposed beyond this cap. */
export const AVAILABLE_CAP = 99;
