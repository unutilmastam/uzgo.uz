import type { SearchAll } from '@uzgo/contracts';
import { Price } from '@uzgo/ui/components/price';
import { Sparkles, UtensilsCrossed } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';

/** UZGO Food matches above the product results of a search (ADR 0026). */
export async function FoodResults({ result, query }: { result: SearchAll; query: string }) {
  const [t, locale] = await Promise.all([
    getTranslations('search'),
    getLocale() as Promise<Locale>,
  ]);
  const hasFood = result.restaurants.length > 0 || result.dishes.length > 0;
  return (
    <div className="mb-6 flex flex-col gap-4">
      {hasFood ? (
        <section
          aria-labelledby="food-results"
          className="rounded-xl border border-border bg-card p-4"
        >
          <h2 id="food-results" className="mb-3 flex items-center gap-2 font-semibold">
            <UtensilsCrossed aria-hidden="true" className="size-5 text-primary" />
            {t('foodResults')}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {result.restaurants.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/food/${r.slug}`}
                  className="flex flex-col rounded-lg border border-border px-3 py-2 text-sm hover:border-primary"
                  data-testid="search-restaurant"
                >
                  <span className="font-medium">{r.name[locale]}</span>
                  <span className="text-xs text-muted-foreground">{r.address}</span>
                </Link>
              </li>
            ))}
            {result.dishes.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/food/${d.restaurant.slug}`}
                  className="flex flex-col rounded-lg border border-border px-3 py-2 text-sm hover:border-primary"
                  data-testid="search-dish"
                >
                  <span className="font-medium">{d.name[locale]}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {d.restaurant.name[locale]}
                    <Price value={d.priceTiyin} locale={locale} className="text-xs font-normal" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <Link
        href={{ pathname: '/assistant', query: { q: query } }}
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-primary hover:underline"
      >
        <Sparkles aria-hidden="true" className="size-4" />
        {t('askAssistant')}
      </Link>
    </div>
  );
}
