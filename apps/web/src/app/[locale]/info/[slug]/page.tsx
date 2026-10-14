import { EmptyState } from '@uzgo/ui/components/empty-state';
import { FileText } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageShell } from '@/components/page-shell';
import { routing } from '@/i18n/routing';
import { INFO_PAGES, isInfoPage } from '@/lib/info-pages';

type Props = { params: Promise<{ locale: string; slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => INFO_PAGES.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!isInfoPage(slug)) return {};
  const t = await getTranslations('info');
  return { title: t(slug) };
}

/** Placeholder until the real texts (incl. legal pages) are written before launch. */
export default async function InfoPage({ params }: Props) {
  const { slug } = await params;
  if (!isInfoPage(slug)) notFound();
  const t = await getTranslations('info');
  return (
    <PageShell title={t(slug)}>
      <EmptyState icon={<FileText />} title={t('emptyTitle')} description={t('emptyDescription')} />
    </PageShell>
  );
}
