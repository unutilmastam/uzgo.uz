import { Button } from '@uzgo/ui/components/button';
import { Store } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export async function SellerCta() {
  const t = await getTranslations('home');
  return (
    <section
      aria-labelledby="seller-cta"
      className="flex flex-col items-start gap-4 rounded-xl border border-border bg-card p-6 md:flex-row md:items-center md:p-8"
    >
      <div
        aria-hidden="true"
        className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground"
      >
        <Store className="size-7" />
      </div>
      <div className="flex-1">
        <h2 id="seller-cta" className="text-xl font-bold">
          {t('sellerTitle')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('sellerText')}</p>
      </div>
      <Button asChild variant="accent" size="lg">
        <Link href="/info/sell">{t('sellerCta')}</Link>
      </Button>
    </section>
  );
}
