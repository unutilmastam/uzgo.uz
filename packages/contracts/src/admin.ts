import { z } from 'zod';
import { roleSchema } from './auth.js';
import { localizedNameSchema } from './geo.js';
import { orderStatusSchema } from './orders.js';
import { tiyinSchema } from './products.js';
import { productStatusSchema, sellerProductSchema } from './seller.js';
import { slugSchema, storeStatusSchema } from './stores.js';

const page = z.coerce.number().int().min(1).max(1000).default(1);
const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
  });

const name = (max: number) => z.string().trim().min(1).max(max);
const localized = (max: number) => z.strictObject({ uz: name(max), ru: name(max) });
const code = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/, 'Lowercase latin, digits, _ or -');

// ─── Product moderation ─────────────────────────────────────────────────────

export const adminProductListQuerySchema = z.strictObject({
  status: productStatusSchema.default('PENDING_REVIEW'),
  page,
});

export const adminProductSummarySchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  status: productStatusSchema,
  title: localizedNameSchema,
  image: z.string().nullable(),
  minPriceTiyin: tiyinSchema.nullable(),
  store: z.object({
    id: z.uuid(),
    slug: z.string(),
    name: localizedNameSchema,
    status: storeStatusSchema,
  }),
  category: z.object({ id: z.uuid(), name: localizedNameSchema }),
  submittedAt: z.iso.datetime().nullable(),
});
export const adminProductListResponseSchema = pageOf(adminProductSummarySchema);
export type AdminProductList = z.infer<typeof adminProductListResponseSchema>;

export const adminProductSchema = sellerProductSchema.extend({
  store: adminProductSummarySchema.shape.store,
  category: adminProductSummarySchema.shape.category,
});
export type AdminProduct = z.infer<typeof adminProductSchema>;

/** POST /api/v1/admin/products/:id/reject */
export const moderationReasonSchema = z.strictObject({ reason: z.string().trim().min(3).max(500) });

// ─── Categories and attributes ──────────────────────────────────────────────

export const adminCategorySchema = z.object({
  id: z.uuid(),
  parentId: z.uuid().nullable(),
  slug: z.string(),
  name: localizedNameSchema,
  icon: z.string().nullable(),
  sort: z.number().int(),
  active: z.boolean(),
  attributeIds: z.array(z.uuid()),
  productCount: z.number().int(),
});
export type AdminCategory = z.infer<typeof adminCategorySchema>;
export const adminCategoriesResponseSchema = z.object({ items: z.array(adminCategorySchema) });

const icon = z
  .string()
  .regex(/^[a-z0-9-]{1,40}$/)
  .nullable();

export const createCategorySchema = z.strictObject({
  parentId: z.uuid().nullable().default(null),
  slug: slugSchema,
  name: localized(80),
  icon: icon.default(null),
  sort: z.number().int().min(0).max(10_000).default(0),
  active: z.boolean().default(true),
});
export type CreateCategory = z.input<typeof createCategorySchema>;

export const updateCategorySchema = z
  .strictObject({
    parentId: z.uuid().nullable().optional(),
    slug: slugSchema.optional(),
    name: localized(80).optional(),
    icon: icon.optional(),
    sort: z.number().int().min(0).max(10_000).optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');
export type UpdateCategory = z.infer<typeof updateCategorySchema>;

/** PUT /api/v1/admin/categories/:id/attributes — filters of a category. */
export const categoryAttributesSchema = z.strictObject({
  attributeIds: z.array(z.uuid()).max(20),
});

export const adminAttributeSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: localizedNameSchema,
  sort: z.number().int(),
  values: z.array(
    z.object({ id: z.uuid(), code: z.string(), name: localizedNameSchema, sort: z.number().int() }),
  ),
});
export type AdminAttribute = z.infer<typeof adminAttributeSchema>;
export const adminAttributesResponseSchema = z.object({ items: z.array(adminAttributeSchema) });

export const createAttributeSchema = z.strictObject({
  code,
  name: localized(60),
  sort: z.number().int().min(0).max(10_000).default(0),
});
export const updateAttributeSchema = z
  .strictObject({
    name: localized(60).optional(),
    sort: z.number().int().min(0).max(10_000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');
export const createAttributeValueSchema = createAttributeSchema;
export const updateAttributeValueSchema = updateAttributeSchema;

// ─── Users ──────────────────────────────────────────────────────────────────

export const adminUserListQuerySchema = z.strictObject({
  /** Digits of a phone number (partial match). */
  phone: z
    .string()
    .trim()
    .regex(/^\+?\d{3,15}$/)
    .optional(),
  role: roleSchema.optional(),
  page,
});

export const adminUserSchema = z.object({
  id: z.uuid(),
  phone: z.string(),
  name: z.string().nullable(),
  status: z.enum(['ACTIVE', 'BLOCKED']),
  roles: z.array(roleSchema),
  totpEnabled: z.boolean(),
  lastLoginAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;
export const adminUserListResponseSchema = pageOf(adminUserSchema);
export type AdminUserList = z.infer<typeof adminUserListResponseSchema>;

// ─── Orders ─────────────────────────────────────────────────────────────────

export const adminOrderListQuerySchema = z.strictObject({
  status: orderStatusSchema.optional(),
  /** Order number, e.g. UZ-2026-000123. */
  number: z
    .string()
    .trim()
    .regex(/^UZ-\d{4}-\d{6}$/)
    .optional(),
  page,
});
export const adminOrderSummarySchema = z.object({
  number: z.string(),
  status: orderStatusSchema,
  createdAt: z.iso.datetime(),
  totalTiyin: tiyinSchema,
  customerPhone: z.string(),
  storeCount: z.number().int(),
});
export const adminOrderListResponseSchema = pageOf(adminOrderSummarySchema);
export type AdminOrderList = z.infer<typeof adminOrderListResponseSchema>;

// ─── Audit log ──────────────────────────────────────────────────────────────

export const auditQuerySchema = z.strictObject({
  action: z
    .string()
    .trim()
    .regex(/^[a-z_]+(\.[a-z_]+)*\.?$/)
    .max(60)
    .optional(),
  entityType: z
    .string()
    .regex(/^[A-Za-z]{1,40}$/)
    .optional(),
  entityId: z.string().trim().max(64).optional(),
  actorId: z.uuid().optional(),
  /** Cursor: id of the last event of the previous page (newest first). */
  before: z.uuid().optional(),
});

export const auditEventSchema = z.object({
  id: z.uuid(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  actor: z.object({ id: z.uuid(), phone: z.string() }).nullable(),
  metadata: z.unknown(),
  requestId: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type AuditEventView = z.infer<typeof auditEventSchema>;
export const auditListResponseSchema = z.object({
  items: z.array(auditEventSchema),
  nextBefore: z.uuid().nullable(),
});
export type AuditList = z.infer<typeof auditListResponseSchema>;
