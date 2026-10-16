import { z } from 'zod';
import { localizedNameSchema } from './geo.js';
import { productSummarySchema, tiyinSchema } from './products.js';

// ─── Unified search and the shopping assistant (Phase 9d, ADR 0026) ─────────

/** GET /api/v1/search/all?q= */
export const searchAllQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(100),
});

const imageSchema = z.object({ url: z.string(), alt: localizedNameSchema.nullable() }).nullable();

export const searchRestaurantSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: localizedNameSchema,
  address: z.string(),
  image: imageSchema,
});
export const searchDishSchema = z.object({
  id: z.uuid(),
  name: localizedNameSchema,
  priceTiyin: tiyinSchema,
  available: z.boolean(),
  image: imageSchema,
  restaurant: z.object({ slug: z.string(), name: localizedNameSchema }),
});
export const searchAllSchema = z.object({
  products: z.array(productSummarySchema),
  productTotal: z.number().int(),
  restaurants: z.array(searchRestaurantSchema),
  dishes: z.array(searchDishSchema),
});
export type SearchAll = z.infer<typeof searchAllSchema>;
export type SearchRestaurant = z.infer<typeof searchRestaurantSchema>;
export type SearchDish = z.infer<typeof searchDishSchema>;

/** Limits shared by the API and the clients. */
export const ASSISTANT_LIMITS = { turns: 20, chars: 2000 } as const;

export const assistantTurnSchema = z.strictObject({
  role: z.enum(['user', 'assistant']),
  text: z.string().trim().min(1).max(ASSISTANT_LIMITS.chars),
});
export type AssistantTurn = z.infer<typeof assistantTurnSchema>;

/** POST /api/v1/assistant/chat — the whole (text-only) conversation, last turn from the user. */
export const assistantChatRequestSchema = z
  .strictObject({
    locale: z.enum(['uz', 'ru']),
    messages: z.array(assistantTurnSchema).min(1).max(ASSISTANT_LIMITS.turns),
  })
  .refine((v) => v.messages.at(-1)?.role === 'user', {
    message: 'The last message must be from the user',
    path: ['messages'],
  });
export type AssistantChatRequest = z.infer<typeof assistantChatRequestSchema>;

/** Items the reply links to (only items the tools returned). */
export const assistantCardSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('product'),
    slug: z.string(),
    name: localizedNameSchema,
    priceTiyin: tiyinSchema,
    image: imageSchema,
  }),
  z.object({ type: z.literal('restaurant'), slug: z.string(), name: localizedNameSchema }),
  z.object({
    type: z.literal('dish'),
    restaurantSlug: z.string(),
    name: localizedNameSchema,
    priceTiyin: tiyinSchema,
  }),
]);
export type AssistantCard = z.infer<typeof assistantCardSchema>;

export const assistantReplySchema = z.object({
  /** Plain text; internal links look like [Name](/p/slug) or [Name](/food/slug). */
  reply: z.string(),
  cards: z.array(assistantCardSchema),
  remainingToday: z.number().int(),
});
export type AssistantReply = z.infer<typeof assistantReplySchema>;

/** GET /api/v1/assistant/status */
export const assistantStatusSchema = z.object({
  enabled: z.boolean(),
  dailyLimit: z.number().int(),
  /** Null for guests. */
  remainingToday: z.number().int().nullable(),
});
export type AssistantStatus = z.infer<typeof assistantStatusSchema>;

/**
 * Splits assistant text into plain parts and internal UZGO links. Only
 * relative /p/<slug> and /food/<slug> links become links; anything else
 * (external URLs included) stays plain text.
 */
export function assistantTextParts(
  text: string,
): ({ type: 'text'; text: string } | { type: 'link'; text: string; href: string })[] {
  const parts: ({ type: 'text'; text: string } | { type: 'link'; text: string; href: string })[] =
    [];
  const pattern = /\[([^\]\n]{1,120})\]\((\/(?:p|food)\/[a-z0-9]+(?:-[a-z0-9]+)*)\)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const [whole, label, href] = match;
    if (match.index > last) parts.push({ type: 'text', text: text.slice(last, match.index) });
    parts.push({ type: 'link', text: label ?? '', href: href ?? '' });
    last = match.index + whole.length;
  }
  if (last < text.length) parts.push({ type: 'text', text: text.slice(last) });
  return parts;
}
