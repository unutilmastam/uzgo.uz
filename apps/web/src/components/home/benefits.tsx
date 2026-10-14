import { BadgeCheck, Banknote, Languages, Store } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

const BENEFITS = [
  { key: 'stores', icon: Store },
  { key: 'cod', icon: Banknote },
  { key: 'moderated', icon: BadgeCheck },
  { key: 'languages', icon: Languages },
] as const;

/** How UZGO works — product facts only, no unverifiable promises. */
export async function Benefits() {
  const t = await getTranslations('benefits');
  return (
    <section aria-label={t('label')}>
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:rounded-xl md:border md:border-border md:bg-card md:px-0 md:py-1">
        {BENEFITS.map(({ key, icon: Icon }, index) => (
          <li
            key={key}
            className={`flex min-w-[15rem] snap-start items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 md:min-w-0 md:rounded-none md:border-0 md:bg-transparent ${index > 0 ? 'md:border-l md:border-border' : ''}`}
          >
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary"
            >
              <Icon className="size-5" />
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-semibold">{t(`${key}Title`)}</span>
              <span className="text-xs text-muted-foreground">{t(`${key}Text`)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
