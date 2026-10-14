import { locale as rootLocale } from 'next/root-params';
import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ locale: explicit }) => {
  // The [locale] segment is the root param; an explicit locale (e.g.
  // getTranslations({ locale })) wins. Unknown values fall back to the default.
  const requested = explicit ?? (await rootLocale());
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const messages = (await import(`../../messages/${locale}.json`)) as {
    default: Record<string, unknown>;
  };
  return { locale, messages: messages.default, timeZone: 'Asia/Tashkent' };
});
