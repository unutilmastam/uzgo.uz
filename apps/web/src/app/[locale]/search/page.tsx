import { Button } from '@uzgo/ui/components/button';
import { EmptyState } from '@uzgo/ui/components/empty-state';
import { PackageSearch } from 'lucide-react';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { PageShell } from '@/components/page-shell';
import { categories } from '@/fixtures/catalog';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function single(value: string | string[] | undefined): string {
  const first = Array.isArray(value) ? value[0] : value;
  return (first ?? '').trim().slice(0, 200);
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('search');
  return { title: t('title') };
}

/** Phase 2: search UI only. Results come from the catalog API in Phase 4. */
export default async function SearchPage({ searchParams }: Props) {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations('search');
  const query = await searchParams;
  const q = single(query.q);
  const category = categories.find((c) => c.slug === single(query.category));

  const title = category ? category.name[locale] : q ? t('resultsFor', { query: q }) : t('title');

  return (
    <PageShell title={title}>
      <EmptyState
        icon={<PackageSearch />}
        title={t('emptyTitle')}
        description={t('emptyDescription')}
        action={
          <Button asChild variant="outline">
            <Link href="/">{t('backHome')}</Link>
          </Button>
        }
      />
    </PageShell>
  );
}
