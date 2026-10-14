import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  // uz-Cyrl and en can be added here later without schema changes (SPEC §3).
  locales: ['uz', 'ru'],
  defaultLocale: 'uz',
  localePrefix: 'always',
});

export type Locale = (typeof routing.locales)[number];
