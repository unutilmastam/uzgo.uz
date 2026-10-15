import { z } from 'zod';
import { productSummarySchema } from './products.js';

/* ─── Favorites (Phase 9a) ─────────────────────────────────────────────── */

/** At most this many saved products per customer. */
export const MAX_FAVORITES = 500;

/** GET /api/v1/favorites — saved products that are still on sale, newest first. */
export const favoritesResponseSchema = z.object({ items: z.array(productSummarySchema) });

/** GET /api/v1/favorites/ids — for the heart buttons. */
export const favoriteIdsResponseSchema = z.object({ productIds: z.array(z.uuid()) });
