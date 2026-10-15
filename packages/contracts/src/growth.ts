import { z } from 'zod';
import { productSummarySchema } from './products.js';

/* ─── Favorites (Phase 9a) ─────────────────────────────────────────────── */

/** At most this many saved products per customer. */
export const MAX_FAVORITES = 500;

/** GET /api/v1/favorites — saved products that are still on sale, newest first. */
export const favoritesResponseSchema = z.object({ items: z.array(productSummarySchema) });

/** GET /api/v1/favorites/ids — for the heart buttons. */
export const favoriteIdsResponseSchema = z.object({ productIds: z.array(z.uuid()) });

/* ─── Reviews (Phase 9a) ───────────────────────────────────────────────── */

export const REVIEW_TEXT_MAX = 1000;

/** Links are not allowed in reviews (spam); the text is shown as plain text. */
const reviewText = z
  .string()
  .trim()
  .max(REVIEW_TEXT_MAX)
  .refine((v) => !/(https?:\/\/|www\.|\bt\.me\/)/i.test(v), 'Links are not allowed');

/** PUT /api/v1/products/:slug/reviews — create or update the caller's review. */
export const upsertReviewSchema = z.strictObject({
  rating: z.number().int().min(1).max(5),
  text: reviewText.optional(),
});
export type UpsertReview = z.infer<typeof upsertReviewSchema>;

export const reviewSchema = z.object({
  id: z.uuid(),
  rating: z.number().int().min(1).max(5),
  text: z.string().nullable(),
  /** "Ali V." — first name and last initial; null when the customer has no name. */
  authorName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Review = z.infer<typeof reviewSchema>;

/** GET /api/v1/catalog/products/:slug/reviews?page= */
export const productReviewsResponseSchema = z.object({
  items: z.array(reviewSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  /** Count of published reviews per star (index 0 = 1 star). */
  distribution: z.array(z.number().int().nonnegative()).length(5),
});
export type ProductReviews = z.infer<typeof productReviewsResponseSchema>;

/** GET /api/v1/products/:slug/reviews/mine */
export const myReviewResponseSchema = z.object({
  /** Only customers who received the product may review it. */
  canReview: z.boolean(),
  review: reviewSchema.extend({ hidden: z.boolean() }).nullable(),
});
export type MyReview = z.infer<typeof myReviewResponseSchema>;

export const adminReviewSchema = reviewSchema.extend({
  status: z.enum(['PUBLISHED', 'HIDDEN']),
  moderationNote: z.string().nullable(),
  product: z.object({
    id: z.uuid(),
    slug: z.string(),
    title: z.object({ uz: z.string(), ru: z.string() }),
  }),
  /** Masked phone of the author. */
  authorPhone: z.string(),
});
export type AdminReview = z.infer<typeof adminReviewSchema>;
export const adminReviewListSchema = z.object({
  items: z.array(adminReviewSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

/** POST /api/v1/admin/reviews/:id/hide */
export const hideReviewSchema = z.strictObject({ note: z.string().trim().min(3).max(500) });

const reviewPage = z.coerce.number().int().min(1).max(1000).default(1);

/** GET /api/v1/catalog/products/:slug/reviews */
export const productReviewsQuerySchema = z.strictObject({ page: reviewPage });

/** GET /api/v1/admin/reviews — newest first; optional status and rating filters. */
export const adminReviewQuerySchema = z.strictObject({
  status: z.enum(['PUBLISHED', 'HIDDEN']).optional(),
  maxRating: z.coerce.number().int().min(1).max(5).optional(),
  page: reviewPage,
});

// ─── Promo codes (UZGO-funded, ADR 0023) ────────────────────────────────────

export const PROMO_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,31}$/;

/** A code as typed by the customer: spaces trimmed, case-insensitive. */
export const promoCodeInputSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(PROMO_CODE_PATTERN, 'Invalid promo code');

export const PROMO_ERRORS = [
  'PROMO_INVALID',
  'PROMO_EXPIRED',
  'PROMO_MIN_ORDER',
  'PROMO_LIMIT_REACHED',
] as const;
export const promoErrorSchema = z.enum(PROMO_ERRORS);
export type PromoError = z.infer<typeof promoErrorSchema>;

const tiyin = z.string().regex(/^\d+$/);
const optionalDate = z.iso.datetime({ offset: true }).nullable().optional();

export const adminPromoSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  kind: z.enum(['PERCENT', 'FIXED']),
  percentBp: z.number().int().nullable(),
  amountTiyin: tiyin.nullable(),
  maxDiscountTiyin: tiyin.nullable(),
  minOrderTiyin: tiyin,
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  usageLimit: z.number().int().nullable(),
  perUserLimit: z.number().int(),
  active: z.boolean(),
  description: z.string().nullable(),
  /** Orders that used the code and were not cancelled. */
  used: z.number().int(),
  /** Sum of their discounts (UZGO's cost). */
  discountTotalTiyin: tiyin,
  createdAt: z.string(),
});
export type AdminPromo = z.infer<typeof adminPromoSchema>;
export const adminPromoListSchema = z.object({ items: z.array(adminPromoSchema) });

/**
 * POST /api/v1/admin/promo-codes. The discount terms cannot change after
 * creation (orders refer to them); create a new code instead.
 */
export const createPromoSchema = z
  .strictObject({
    code: promoCodeInputSchema,
    kind: z.enum(['PERCENT', 'FIXED']),
    /** PERCENT: 1–9000 basis points (0.01 %–90 %). */
    percentBp: z.number().int().min(1).max(9000).optional(),
    /** FIXED: amount in tiyin. */
    amountTiyin: tiyin.refine((v) => BigInt(v) > 0n, 'Must be positive').optional(),
    /** PERCENT only: cap in tiyin. */
    maxDiscountTiyin: tiyin.refine((v) => BigInt(v) > 0n, 'Must be positive').optional(),
    minOrderTiyin: tiyin.default('0'),
    startsAt: optionalDate,
    endsAt: optionalDate,
    usageLimit: z.number().int().min(1).max(1_000_000).nullable().optional(),
    perUserLimit: z.number().int().min(1).max(100).default(1),
    description: z.string().trim().max(200).nullable().optional(),
  })
  .refine(
    (v) =>
      v.kind === 'PERCENT'
        ? v.percentBp !== undefined && v.amountTiyin === undefined
        : v.amountTiyin !== undefined &&
          v.percentBp === undefined &&
          v.maxDiscountTiyin === undefined,
    { message: 'Set percentBp for PERCENT or amountTiyin for FIXED', path: ['kind'] },
  )
  .refine((v) => !v.startsAt || !v.endsAt || new Date(v.startsAt) < new Date(v.endsAt), {
    message: 'startsAt must be before endsAt',
    path: ['endsAt'],
  });
export type CreatePromo = z.output<typeof createPromoSchema>;

/** PATCH /api/v1/admin/promo-codes/:id — switch off, extend or limit a code. */
export const updatePromoSchema = z
  .strictObject({
    active: z.boolean().optional(),
    endsAt: optionalDate,
    usageLimit: z.number().int().min(1).max(1_000_000).nullable().optional(),
    description: z.string().trim().max(200).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdatePromo = z.output<typeof updatePromoSchema>;
