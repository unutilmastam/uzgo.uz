'use client';

import { Skeleton } from '@uzgo/ui/components/skeleton';
import { useTranslations } from 'next-intl';

/**
 * Skeleton for routes that render on request (search, status). Used only by
 * those routes' loading.tsx: a locale-wide loading boundary would start
 * streaming before notFound() and turn real 404s into 200s.
 */
export function PageLoading() {
  const t = useTranslations('states');
  return (
    <div className="mx-auto max-w-7xl px-4 py-6" role="status" aria-live="polite">
      <span className="sr-only">{t('loading')}</span>
      <Skeleton className="aspect-[16/7] w-full rounded-xl md:aspect-[16/5]" />
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="aspect-[4/5] w-full rounded-lg" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
