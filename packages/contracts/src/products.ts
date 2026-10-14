import { z } from 'zod';
import { localizedNameSchema } from './geo.js';

/** Integer tiyin as a decimal string (BigInt-safe in JSON). */
export const tiyinSchema = z.string().regex(/^\d+$/);

export const storeRefSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: localizedNameSchema,
  isDemo: z.boolean(),
});
export type StoreRef = z.infer<typeof storeRefSchema>;

export const imageSchema = z.object({ url: z.string(), alt: localizedNameSchema.nullable() });

const optionSchema = z.object({
  attribute: z.string(),
  attributeName: localizedNameSchema,
  code: z.string(),
  name: localizedNameSchema,
});

export const variantSchema = z.object({
  id: z.uuid(),
  sku: z.string(),
  priceTiyin: tiyinSchema,
  compareAtPriceTiyin: tiyinSchema.nullable(),
  /** Available quantity, capped (exact stock is not exposed beyond the cap). */
  available: z.number().int().nonnegative(),
  options: z.array(optionSchema),
});
export type Variant = z.infer<typeof variantSchema>;

/** Product card in listings and search results. */
export const productSummarySchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: localizedNameSchema,
  categorySlug: z.string(),
  categoryIcon: z.string().nullable(),
  store: storeRefSchema,
  priceTiyin: tiyinSchema,
  compareAtPriceTiyin: tiyinSchema.nullable(),
  image: imageSchema.nullable(),
});
export type ProductSummary = z.infer<typeof productSummarySchema>;

/** GET /api/v1/catalog/products/:slug */
export const productDetailResponseSchema = z.object({
  product: z.object({
    id: z.uuid(),
    slug: z.string(),
    title: localizedNameSchema,
    description: localizedNameSchema,
    category: z.object({
      slug: z.string(),
      name: localizedNameSchema,
      icon: z.string().nullable(),
    }),
    breadcrumbs: z.array(z.object({ slug: z.string(), name: localizedNameSchema })),
    store: storeRefSchema,
    attributes: z.array(optionSchema),
    images: z.array(imageSchema),
    variants: z.array(variantSchema),
  }),
});
export type ProductDetail = z.infer<typeof productDetailResponseSchema>['product'];

/** GET /api/v1/catalog/stores/:slug */
export const storeDetailResponseSchema = z.object({
  store: storeRefSchema.extend({
    description: localizedNameSchema.nullable(),
    district: localizedNameSchema.nullable(),
    region: localizedNameSchema.nullable(),
  }),
});
export type StoreDetail = z.infer<typeof storeDetailResponseSchema>['store'];
