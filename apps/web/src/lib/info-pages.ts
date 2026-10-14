/** Static information pages linked from the footer. Content arrives before launch (Phase 7). */
export const INFO_PAGES = ['about', 'help', 'sell', 'terms', 'privacy', 'contacts'] as const;

export type InfoPage = (typeof INFO_PAGES)[number];

export function isInfoPage(value: string): value is InfoPage {
  return (INFO_PAGES as readonly string[]).includes(value);
}
