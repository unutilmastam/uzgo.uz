import ru from '../i18n/ru.json';
import uz from '../i18n/uz.json';

export type Locale = 'uz' | 'ru';
export type MessageKey = keyof typeof uz;
type Params = Record<string, string | number>;

const MESSAGES: Record<Locale, Record<string, string>> = { uz, ru };
const PLURALS: Record<Locale, Intl.PluralRules> = {
  uz: new Intl.PluralRules('uz'),
  ru: new Intl.PluralRules('ru'),
};

/**
 * Plain key → text lookup with `{name}` placeholders. Plural forms live in
 * sibling keys (`items_one`, `items_few`, `items_many`, `items_other`) and are
 * picked with Intl.PluralRules from the `count` parameter.
 */
export function translate(locale: Locale, key: string, params: Params = {}): string {
  const messages = MESSAGES[locale];
  let text = messages[key];
  if (text === undefined && typeof params.count === 'number') {
    const form = PLURALS[locale].select(params.count);
    text = messages[`${key}_${form}`] ?? messages[`${key}_other`];
  }
  if (text === undefined) return key;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/** Device language → app locale (Russian if the phone is in Russian, else Uzbek). */
export function localeFromDevice(languageCode: string | null | undefined): Locale {
  return languageCode?.toLowerCase().startsWith('ru') ? 'ru' : 'uz';
}

export function messageKeys(locale: Locale): string[] {
  return Object.keys(MESSAGES[locale]).sort();
}
