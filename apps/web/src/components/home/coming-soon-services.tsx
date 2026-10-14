import { ServiceCard } from '@uzgo/ui/components/service-card';
import { Car, MapPinned, Truck, UtensilsCrossed } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

const SERVICES = [
  { key: 'delivery', icon: <Truck /> },
  { key: 'go', icon: <Car /> },
  { key: 'food', icon: <UtensilsCrossed /> },
  { key: 'maps', icon: <MapPinned /> },
] as const;

/** Future ecosystem modules — shown, labelled, never interactive (SPEC §2). */
export async function ComingSoonServices() {
  const t = await getTranslations();
  return (
    <section aria-labelledby="services">
      <h2 id="services" className="text-xl font-bold md:text-2xl">
        {t('home.servicesTitle')}
      </h2>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">{t('home.servicesSubtitle')}</p>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SERVICES.map((service) => (
          <li key={service.key}>
            <ServiceCard
              icon={service.icon}
              title={t(`services.${service.key}Title`)}
              description={t(`services.${service.key}Text`)}
              statusLabel={t('common.comingSoon')}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
