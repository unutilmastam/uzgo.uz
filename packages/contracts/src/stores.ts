import { z } from 'zod';
import { localizedNameSchema } from './geo.js';

export const STORE_STATUSES = ['PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED'] as const;
export const storeStatusSchema = z.enum(STORE_STATUSES);
export type StoreStatus = z.infer<typeof storeStatusSchema>;

export const LEGAL_TYPES = ['INDIVIDUAL_ENTREPRENEUR', 'LEGAL_ENTITY'] as const;
export const legalTypeSchema = z.enum(LEGAL_TYPES);
export type LegalType = z.infer<typeof legalTypeSchema>;

export const slugSchema = z
  .string()
  .trim()
  .min(3)
  .max(60)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Lowercase latin letters, digits and dashes');

const storeName = z.string().trim().min(2).max(80);

/** POST /api/v1/seller/stores — a store application, reviewed by staff. */
export const storeApplicationSchema = z.strictObject({
  name: z.strictObject({ uz: storeName, ru: storeName }),
  slug: slugSchema,
  districtId: z.uuid(),
  legalType: legalTypeSchema,
  legalName: z.string().trim().min(2).max(160),
  /** STIR / INN: 9 digits. */
  taxId: z.string().regex(/^\d{9}$/, 'The tax id has 9 digits'),
  /** Normalised and validated to E.164 by the API. */
  contactPhone: z
    .string()
    .trim()
    .min(7)
    .max(20)
    .regex(/^[+\d\s()-]+$/),
});
export type StoreApplication = z.infer<typeof storeApplicationSchema>;

export const STORE_MEMBER_ROLES = ['OWNER', 'STAFF'] as const;

export const sellerStoreSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: localizedNameSchema,
  status: storeStatusSchema,
  isDemo: z.boolean(),
  myRole: z.enum(STORE_MEMBER_ROLES),
  reviewNote: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type SellerStore = z.infer<typeof sellerStoreSchema>;

/** GET /api/v1/seller/stores */
export const sellerStoresResponseSchema = z.object({ items: z.array(sellerStoreSchema) });

export const adminStoreSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: localizedNameSchema,
  status: storeStatusSchema,
  isDemo: z.boolean(),
  legalType: legalTypeSchema.nullable(),
  legalName: z.string().nullable(),
  taxId: z.string().nullable(),
  contactPhone: z.string().nullable(),
  district: z.object({ id: z.uuid(), name: localizedNameSchema }).nullable(),
  owners: z.array(z.object({ id: z.uuid(), phone: z.string() })),
  reviewNote: z.string().nullable(),
  reviewedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type AdminStore = z.infer<typeof adminStoreSchema>;

/** GET /api/v1/admin/stores?status=&page= */
export const adminStoreListQuerySchema = z.strictObject({
  status: storeStatusSchema.optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});
export const adminStoreListResponseSchema = z.object({
  items: z.array(adminStoreSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export type AdminStoreList = z.infer<typeof adminStoreListResponseSchema>;

/** POST /api/v1/admin/stores/:id/{reject,suspend} */
export const storeReviewReasonSchema = z.strictObject({
  reason: z.string().trim().min(3).max(500),
});
