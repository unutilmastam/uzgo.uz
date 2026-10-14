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

export const PRODUCT_SORTS = ['relevance', 'newest', 'price_asc', 'price_desc'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

const slug = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .max(120);
const somAmount = z.coerce.number().int().min(0).max(10_000_000_000);

/**
 * GET /api/v1/catalog/products — query string. Prices in whole soʻm.
 * attr: repeatable "code:value" pairs, e.g. attr=color:black&attr=memory:128gb
 * (values of one attribute are OR-ed, different attributes AND-ed).
 */
export const productSearchQuerySchema = z
  .strictObject({
    q: z.string().trim().max(100).optional(),
    category: slug.optional(),
    store: slug.optional(),
    minPrice: somAmount.optional(),
    maxPrice: somAmount.optional(),
    attr: z
      .union([z.string(), z.array(z.string())])
      .transform((v) => (Array.isArray(v) ? v : [v]))
      .pipe(z.array(z.string().regex(/^[a-z0-9-]{1,40}:[a-z0-9-]{1,40}$/)).max(20))
      .optional(),
    sort: z.enum(PRODUCT_SORTS).optional(),
    page: z.coerce.number().int().min(1).max(500).default(1),
    pageSize: z.coerce.number().int().min(1).max(48).default(24),
  })
  .refine((v) => v.minPrice === undefined || v.maxPrice === undefined || v.minPrice <= v.maxPrice, {
    message: 'minPrice must not exceed maxPrice',
    path: ['minPrice'],
  });
export type ProductSearchQuery = z.output<typeof productSearchQuerySchema>;

export const productListResponseSchema = z.object({
  items: z.array(productSummarySchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export type ProductList = z.infer<typeof productListResponseSchema>;
