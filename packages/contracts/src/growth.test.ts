import { describe, expect, it } from 'vitest';
import { upsertReviewSchema } from './growth.js';

describe('review contracts', () => {
  it('accepts 1–5 stars and plain text only', () => {
    expect(upsertReviewSchema.safeParse({ rating: 5, text: 'Zoʻr!' }).success).toBe(true);
    expect(upsertReviewSchema.safeParse({ rating: 0 }).success).toBe(false);
    expect(upsertReviewSchema.safeParse({ rating: 4.5 }).success).toBe(false);
    expect(upsertReviewSchema.safeParse({ rating: 5, text: 'buy at https://x.y' }).success).toBe(
      false,
    );
    expect(upsertReviewSchema.safeParse({ rating: 5, text: 'kanal t.me/spam' }).success).toBe(
      false,
    );
    expect(upsertReviewSchema.safeParse({ rating: 5, text: 'a'.repeat(1001) }).success).toBe(false);
    expect(upsertReviewSchema.safeParse({ rating: 5, userId: 'x' }).success).toBe(false);
  });
});
