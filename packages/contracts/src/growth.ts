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
