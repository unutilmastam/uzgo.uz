import { describe, expect, it } from 'vitest';
import { normalizeSearchText, searchTokens } from './normalize.js';

describe('normalizeSearchText', () => {
  it('folds every Uzbek apostrophe variant', () => {
    const forms = ['Koʻk choy', "Ko'k choy", 'Ko‘k choy', 'Ko’k choy', 'Ko`k choy', 'KOʻK CHOY'];
    for (const form of forms) expect(normalizeSearchText(form)).toBe('kok choy');
    expect(normalizeSearchText('Maʼlumot')).toBe('malumot');
    expect(normalizeSearchText('Gʻallaorol')).toBe('gallaorol');
  });

  it('transliterates Uzbek Cyrillic to Latin', () => {
    expect(normalizeSearchText('Кўк чой')).toBe('kok choy');
    expect(normalizeSearchText('Ғалла')).toBe('galla');
    expect(normalizeSearchText('Ҳовли')).toBe('hovli');
    expect(normalizeSearchText('Қовун')).toBe('qovun');
    expect(normalizeSearchText('чойнак')).toBe(normalizeSearchText('choynak'));
  });

  it('transliterates Russian to the same Latin form', () => {
    expect(normalizeSearchText('Электрочайник 1,7 л')).toBe('elektrochaynik 1 7 l');
    expect(normalizeSearchText('Смартфон Nova X5')).toBe('smartfon nova x5');
    expect(normalizeSearchText('Шёлк')).toBe('shyolk');
  });

  it('strips punctuation and markup', () => {
    expect(normalizeSearchText('<b>Nova</b> X5!!! 6,5"')).toBe('b nova b x5 6 5');
    expect(normalizeSearchText('Café')).toBe('cafe');
  });
});

describe('searchTokens', () => {
  it('splits, de-duplicates and bounds the query', () => {
    expect(searchTokens('  Nova  nova X5 ')).toEqual(['nova', 'x5']);
    expect(searchTokens('a b c d e f g h i j')).toHaveLength(8);
    expect(searchTokens('!!!')).toEqual([]);
    expect(searchTokens("':*|&!()")).toEqual([]);
  });
});
