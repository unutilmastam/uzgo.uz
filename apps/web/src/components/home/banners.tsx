import { Badge } from '@uzgo/ui/components/badge';
import { Button } from '@uzgo/ui/components/button';
import { cn } from '@uzgo/ui/lib/cn';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

const BANNERS = [
  { key: 'banner1', href: '/search', tone: 'from-[#0f2e6e] via-[#143c8f] to-[#2c63d6]' },
  { key: 'banner2', href: '/info/sell', tone: 'from-[#024d32] via-[#03653f] to-[#047a4e]' },
  { key: 'banner3', href: '/info/help', tone: 'from-[#0a1f4d] via-[#143c8f] to-[#047a4e]' },
] as const;

export async function Banners() {
  const t = await getTranslations();

  return (
    <section aria-label={t('home.bannersLabel')}>
      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-3 md:grid-rows-2 md:overflow-visible md:px-0">
        {BANNERS.map((banner, index) => (
          <li
            key={banner.key}
            className={cn(
              'relative isolate flex w-[88%] shrink-0 snap-center flex-col justify-between gap-6 overflow-hidden rounded-xl bg-gradient-to-br p-5 text-white md:w-auto md:p-6',
              index === 0 && 'md:col-span-2 md:row-span-2 md:min-h-80',
              banner.tone,
            )}
          >
            {/* Decorative motion lines — the "GO" idea, original to UZGO. */}
            <svg
              aria-hidden="true"
              viewBox="0 0 200 200"
              className={cn(
                'absolute -z-10 opacity-20',
                index === 0
                  ? '-right-10 -bottom-12 size-56 md:size-80'
                  : '-right-14 -bottom-16 size-44',
              )}
            >
              <circle cx="100" cy="100" r="70" fill="none" stroke="currentColor" strokeWidth="18" />
              <path
                d="M10 70h50M0 100h45M10 130h50"
                stroke="#3dd093"
                strokeWidth="10"
                strokeLinecap="round"
              />
            </svg>
            <div className="flex flex-col gap-2">
              <Badge className="bg-white/15 text-white">{t('common.demo')}</Badge>
              <h2
                className={cn(
                  'max-w-md text-xl leading-tight font-bold text-balance md:text-2xl',
                  index === 0 && 'md:max-w-xl md:text-4xl',
                )}
              >
                {t(`home.${banner.key}Title`)}
              </h2>
              <p className="max-w-md text-sm text-white/85 md:text-base">
                {t(`home.${banner.key}Text`)}
              </p>
            </div>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="w-fit border-white/0 bg-white text-[#0f2e6e] hover:bg-white/90"
            >
              <Link href={banner.href}>{t(`home.${banner.key}Cta`)}</Link>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
