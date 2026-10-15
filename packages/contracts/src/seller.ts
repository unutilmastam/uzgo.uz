import { z } from 'zod';
import { localizedNameSchema } from './geo.js';
import { tiyinSchema } from './products.js';

export const PRODUCT_STATUSES = [
  'DRAFT',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'ARCHIVED',
] as const;
export const productStatusSchema = z.enum(PRODUCT_STATUSES);
export type ProductStatus = z.infer<typeof productStatusSchema>;

const text = (max: number) => z.string().trim().min(2).max(max);
const localized = (max: number) => z.strictObject({ uz: text(max), ru: text(max) });

/** Positive integer tiyin as a decimal string; at most 10 billion soʻm. */
const priceInput = tiyinSchema.refine(
  // Re-checks the format itself: refinements also run after a failed regex.
  (v) => /^\d{1,13}$/.test(v) && BigInt(v) > 0n && BigInt(v) <= 1_000_000_000_000n,
  'Invalid price',
);

const skuSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/, 'Latin letters, digits, dot, dash, underscore');

/** POST /api/v1/seller/stores/:storeId/products — creates a draft. */
export const createProductSchema = z.strictObject({
  categoryId: z.uuid(),
  title: localized(160),
  description: z.strictObject({ uz: text(5000), ru: text(5000) }),
  attributeValueIds: z.array(z.uuid()).max(30).default([]),
});
export type CreateProduct = z.input<typeof createProductSchema>;

/** PATCH …/products/:productId — content edits send an approved product back to review. */
export const updateProductSchema = z
  .strictObject({
    categoryId: z.uuid().optional(),
    title: localized(160).optional(),
    description: z.strictObject({ uz: text(5000), ru: text(5000) }).optional(),
    attributeValueIds: z.array(z.uuid()).max(30).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');
export type UpdateProduct = z.infer<typeof updateProductSchema>;

const variantFields = {
  sku: skuSchema,
  barcode: z
    .string()
    .regex(/^\d{8,14}$/)
    .nullable()
    .optional(),
  priceTiyin: priceInput,
  compareAtPriceTiyin: priceInput.nullable().optional(),
  stock: z.number().int().min(0).max(1_000_000),
  /** MXIK / IKPU code: 17 digits. */
  mxikCode: z
    .string()
    .regex(/^\d{17}$/)
    .nullable()
    .optional(),
  vatRateBp: z.number().int().min(0).max(10_000).nullable().optional(),
  optionValueIds: z.array(z.uuid()).max(5).default([]),
};

/** POST …/products/:productId/variants */
export const createVariantSchema = z.strictObject(variantFields);
export type CreateVariant = z.input<typeof createVariantSchema>;

/**
 * PATCH …/variants/:variantId — price and stock changes do not need review.
 * `stockAdjust` is relative (safe against concurrent orders); `stock` sets it.
 */
export const updateVariantSchema = z
  .strictObject({
    sku: skuSchema.optional(),
    barcode: variantFields.barcode,
    priceTiyin: priceInput.optional(),
    compareAtPriceTiyin: variantFields.compareAtPriceTiyin,
    stock: variantFields.stock.optional(),
    stockAdjust: z.number().int().min(-1_000_000).max(1_000_000).optional(),
    mxikCode: variantFields.mxikCode,
    vatRateBp: variantFields.vatRateBp,
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update')
  .refine((value) => value.stock === undefined || value.stockAdjust === undefined, {
    message: 'Use either stock or stockAdjust',
  });
export type UpdateVariant = z.infer<typeof updateVariantSchema>;

export const sellerVariantSchema = z.object({
  id: z.uuid(),
  sku: z.string(),
  barcode: z.string().nullable(),
  priceTiyin: tiyinSchema,
  compareAtPriceTiyin: tiyinSchema.nullable(),
  stock: z.number().int(),
  mxikCode: z.string().nullable(),
  vatRateBp: z.number().int().nullable(),
  active: z.boolean(),
  options: z.array(z.object({ id: z.uuid(), attribute: z.string(), name: localizedNameSchema })),
});
export type SellerVariant = z.infer<typeof sellerVariantSchema>;

export const sellerImageSchema = z.object({
  id: z.uuid(),
  url: z.string(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
});

export const sellerProductSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  status: productStatusSchema,
  categoryId: z.uuid(),
  title: localizedNameSchema,
  description: localizedNameSchema,
  attributeValueIds: z.array(z.uuid()),
  moderationNote: z.string().nullable(),
  submittedAt: z.iso.datetime().nullable(),
  reviewedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
  variants: z.array(sellerVariantSchema),
  images: z.array(sellerImageSchema),
});
export type SellerProduct = z.infer<typeof sellerProductSchema>;

export const sellerProductResponseSchema = z.object({ product: sellerProductSchema });

export const sellerProductSummarySchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  status: productStatusSchema,
  title: localizedNameSchema,
  image: z.string().nullable(),
  minPriceTiyin: tiyinSchema.nullable(),
  totalStock: z.number().int(),
  variantCount: z.number().int(),
  moderationNote: z.string().nullable(),
  updatedAt: z.iso.datetime(),
});
export type SellerProductSummary = z.infer<typeof sellerProductSummarySchema>;

/** GET …/products?status=&page= */
export const sellerProductListQuerySchema = z.strictObject({
  status: productStatusSchema.optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});
export const sellerProductListResponseSchema = z.object({
  items: z.array(sellerProductSummarySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export type SellerProductList = z.infer<typeof sellerProductListResponseSchema>;

/** PUT …/products/:productId/images/order */
export const imageOrderSchema = z.strictObject({ ids: z.array(z.uuid()).min(1).max(10) });

/** Store team (owner only). */
export const storeMemberSchema = z.object({
  userId: z.uuid(),
  phone: z.string(),
  name: z.string().nullable(),
  role: z.enum(['OWNER', 'STAFF']),
  createdAt: z.iso.datetime(),
});
export type StoreMember = z.infer<typeof storeMemberSchema>;
export const storeMembersResponseSchema = z.object({ items: z.array(storeMemberSchema) });

/** POST /api/v1/seller/stores/:storeId/members — the person must have signed in once. */
export const addStoreMemberSchema = z.strictObject({
  phone: z
    .string()
    .trim()
    .min(7)
    .max(20)
    .regex(/^[+\d\s()-]+$/),
});
export type AddStoreMember = z.infer<typeof addStoreMemberSchema>;

/** Limits shared by the API and the seller UI. */
export const PRODUCT_IMAGE_LIMITS = {
  maxBytes: 8 * 1024 * 1024,
  maxImages: 10,
  maxSide: 1600,
  types: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
} as const;

/** GET /api/v1/seller/categories/:id/attributes — what a product in this category can use. */
export const sellerAttributeSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: localizedNameSchema,
  values: z.array(z.object({ id: z.uuid(), code: z.string(), name: localizedNameSchema })),
});
export type SellerAttribute = z.infer<typeof sellerAttributeSchema>;
export const sellerAttributesResponseSchema = z.object({ items: z.array(sellerAttributeSchema) });
