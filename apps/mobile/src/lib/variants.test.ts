import type { Variant } from '@uzgo/contracts';
import { describe, expect, it } from 'vitest';
import { choose, defaultVariant, findVariant, optionGroups, selectionOf } from './variants';

const opt = (attribute: string, code: string) => ({
  attribute,
  attributeName: { uz: attribute, ru: attribute },
  code,
  name: { uz: code, ru: code },
});
const variant = (id: string, available: number, ...options: ReturnType<typeof opt>[]): Variant => ({
  id,
  sku: id,
  priceTiyin: '100',
  compareAtPriceTiyin: null,
  available,
  options,
});

const variants = [
  variant('a', 0, opt('color', 'black'), opt('memory', '128')),
  variant('b', 3, opt('color', 'black'), opt('memory', '256')),
  variant('c', 1, opt('color', 'white'), opt('memory', '128')),
];

describe('variant selection', () => {
  it('groups options by attribute', () => {
    expect(optionGroups(variants).map((g) => [g.attribute, g.values.map((v) => v.code)])).toEqual([
      ['color', ['black', 'white']],
      ['memory', ['128', '256']],
    ]);
  });

  it('starts with the first variant in stock', () => {
    expect(defaultVariant(variants)?.id).toBe('b');
    expect(defaultVariant([])).toBeUndefined();
  });

  it('keeps compatible choices and falls back to an existing combination', () => {
    const start = selectionOf(variants[1] as Variant); // black/256
    expect(findVariant(variants, choose(variants, start, 'memory', '128'))?.id).toBe('a');
    // white/256 does not exist → white/128
    expect(findVariant(variants, choose(variants, start, 'color', 'white'))?.id).toBe('c');
  });
});
