import { z } from 'zod';
import { localizedNameSchema } from './geo.js';
import { storeRefSchema, tiyinSchema } from './products.js';

export const MAX_LINE_QUANTITY = 99;

export const cartLineStatusSchema = z.enum(['OK', 'INSUFFICIENT_STOCK', 'UNAVAILABLE']);
export type CartLineStatus = z.infer<typeof cartLineStatusSchema>;

export const cartLineSchema = z.object({
  variantId: z.uuid(),
  productSlug: z.string(),
  title: localizedNameSchema,
  /** Variant option labels, e.g. ["128 GB", "Qora"]. */
  options: z.array(localizedNameSchema),
  categoryIcon: z.string().nullable(),
  imageUrl: z.string().nullable(),
  /** Current server price — never a price stored in the cart. */
  unitPriceTiyin: tiyinSchema,
  quantity: z.number().int().min(1),
  available: z.number().int().nonnegative(),
  lineTotalTiyin: tiyinSchema,
  status: cartLineStatusSchema,
});
export type CartLine = z.infer<typeof cartLineSchema>;

export const cartViewSchema = z.object({
  groups: z.array(
    z.object({ store: storeRefSchema, lines: z.array(cartLineSchema), subtotalTiyin: tiyinSchema }),
  ),
  /** Number of units in OK lines. */
  itemCount: z.number().int().nonnegative(),
  subtotalTiyin: tiyinSchema,
  deliveryTiyin: tiyinSchema,
  totalTiyin: tiyinSchema,
  hasIssues: z.boolean(),
});
export type CartView = z.infer<typeof cartViewSchema>;

export const cartResponseSchema = z.object({ cart: cartViewSchema });

const quantity = z.number().int().min(1).max(MAX_LINE_QUANTITY);

/** POST /api/v1/cart/items — adds to the existing quantity. */
export const addCartItemSchema = z.strictObject({
  variantId: z.uuid(),
  quantity: quantity.default(1),
});
/** PATCH /api/v1/cart/items/:variantId — sets the quantity. */
export const updateCartItemSchema = z.strictObject({ quantity });
