import { describe, expect, it } from 'vitest';
import {
  createPromoSchema,
  promoCodeInputSchema,
  updatePromoSchema,
  upsertReviewSchema,
} from './growth.js';

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

describe('promo contracts', () => {
  it('normalizes typed codes and rejects odd ones', () => {
    expect(promoCodeInputSchema.parse('  kuz-2026 ')).toBe('KUZ-2026');
    expect(promoCodeInputSchema.safeParse('ab').success).toBe(false);
    expect(promoCodeInputSchema.safeParse('-ABC').success).toBe(false);
    expect(promoCodeInputSchema.safeParse('A B C').success).toBe(false);
  });

  it('requires terms that match the kind', () => {
    expect(
      createPromoSchema.safeParse({ code: 'KUZ', kind: 'PERCENT', percentBp: 1000 }).success,
    ).toBe(true);
    expect(
      createPromoSchema.safeParse({ code: 'KUZ', kind: 'FIXED', amountTiyin: '0' }).success,
    ).toBe(false);
    expect(
      createPromoSchema.safeParse({
        code: 'KUZ',
        kind: 'FIXED',
        amountTiyin: '1000',
        maxDiscountTiyin: '500',
      }).success,
    ).toBe(false);
    expect(
      createPromoSchema.safeParse({
        code: 'KUZ',
        kind: 'PERCENT',
        percentBp: 1000,
        startsAt: '2026-11-02T00:00:00Z',
        endsAt: '2026-11-01T00:00:00Z',
      }).success,
    ).toBe(false);
    expect(updatePromoSchema.safeParse({}).success).toBe(false);
    expect(updatePromoSchema.safeParse({ active: false }).success).toBe(true);
  });
});
