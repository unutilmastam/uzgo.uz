import { ServiceCard } from '@uzgo/ui/components/service-card';
import { getTranslations } from 'next-intl/server';
import { DeliveryArt, FoodArt, GoArt, MarketArt } from '@/components/art/service-art';
import { Link } from '@/i18n/navigation';

const SERVICES = [
  { key: 'market', art: MarketArt, tint: 'bg-[#e8effd] dark:bg-[#1b2a4d]', live: true },
  { key: 'delivery', art: DeliveryArt, tint: 'bg-[#fff3e0] dark:bg-[#3a2a12]', live: false },
  { key: 'go', art: GoArt, tint: 'bg-[#dcf8eb] dark:bg-[#0f3326]', live: false },
  { key: 'food', art: FoodArt, tint: 'bg-[#ffe9e0] dark:bg-[#3a1d12]', live: false },
] as const;

/**
 * The UZGO ecosystem at a glance. Market is live; the rest are labelled
 * "coming soon" and are deliberately not interactive (SPEC §2).
 */
export async function ServicesGrid() {
  const t = await getTranslations();
  return (
    <section
      aria-labelledby="services"
      className="rounded-2xl border border-border bg-card p-3 md:p-5"
    >
      <div className="mb-3 flex items-baseline justify-between gap-2 px-1">
        <h2 id="services" className="text-lg font-bold md:text-xl">
          {t('home.servicesTitle')}
        </h2>
        <p className="hidden text-sm text-muted-foreground sm:block">
          {t('home.servicesSubtitle')}
        </p>
      </div>
      <ul className="grid grid-cols-4 gap-1 sm:gap-3">
        {SERVICES.map(({ key, art: Art, tint, live }) => (
          <li key={key}>
            <ServiceCard
              icon={<Art />}
              tint={tint}
              title={t(`services.${key}Title`)}
              description={t(`services.${key}Text`)}
              statusLabel={live ? t('services.live') : t('common.comingSoon')}
              {...(live ? { href: '/catalog', linkAs: Link } : {})}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
