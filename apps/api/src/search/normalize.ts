/**
 * Search normalisation (SPEC §3): one canonical Latin form for Uzbek Latin,
 * Uzbek Cyrillic and Russian, so "чойнак", "choynak" and "Choʻynak" meet.
 *
 * 1. NFKC + lowercase.
 * 2. Every apostrophe variant (ʻ ʼ ' ‘ ’ ` ´) is dropped: oʻ/o'/o` → o, gʻ → g.
 * 3. Cyrillic is transliterated to Uzbek Latin (Uzbek + Russian letters).
 * 4. Anything that is not a-z / 0-9 becomes a single space.
 */
const CYRILLIC: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  ғ: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'j',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  қ: 'q',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  ў: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'x',
  ҳ: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sh',
  ъ: '',
  ы: 'i',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  і: 'i',
  ң: 'ng',
};

const APOSTROPHES = /[ʻʼ'‘’`´ʹ]/g;

export function normalizeSearchText(input: string): string {
  const lower = input.normalize('NFKC').toLowerCase().replace(APOSTROPHES, '');
  let out = '';
  for (const char of lower) out += CYRILLIC[char] ?? char;
  return out
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Normalised, de-duplicated query tokens (max 8, each 1–40 chars). */
export function searchTokens(query: string): string[] {
  const tokens = normalizeSearchText(query.slice(0, 200)).split(' ').filter(Boolean);
  return [...new Set(tokens)].slice(0, 8).map((t) => t.slice(0, 40));
}
