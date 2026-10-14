import { describe, expect, it } from 'vitest';
import ru from '../../messages/ru.json';
import uz from '../../messages/uz.json';

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [[`${prefix}${key}`, value]] : leaves(value, `${prefix}${key}.`),
  );
}

describe('message files', () => {
  it('uz and ru define exactly the same keys', () => {
    const uzKeys = leaves(uz)
      .map(([k]) => k)
      .sort();
    const ruKeys = leaves(ru)
      .map(([k]) => k)
      .sort();
    expect(ruKeys).toEqual(uzKeys);
  });

  it('have no empty strings', () => {
    for (const [key, value] of [...leaves(uz), ...leaves(ru)]) {
      expect(value.trim(), key).not.toBe('');
    }
  });

  it('write Uzbek oʻ/gʻ and ʼ with the correct characters (U+02BB, U+02BC)', () => {
    // ASCII and typographic quotes after o/g are wrong in Uzbek Latin; they also
    // break ICU message syntax ("'" is an escape character there).
    for (const [key, value] of leaves(uz)) {
      expect(value, key).not.toMatch(/[oOgG]['‘’`]/);
      expect(value, key).not.toMatch(/[a-zA-Z]'[a-zA-Z]/);
    }
  });
});
