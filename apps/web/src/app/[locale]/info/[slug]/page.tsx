import { EmptyState } from '@uzgo/ui/components/empty-state';
import { FileText } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { PageShell } from '@/components/page-shell';
import { legalDoc } from '@/content/legal';
import { type Locale, routing } from '@/i18n/routing';
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

/** Legal pages (public offer, privacy policy) and placeholders for the other info pages. */
export default async function InfoPage({ params }: Props) {
  const { locale, slug } = await params;
  if (!isInfoPage(slug)) notFound();
  const [t, format] = await Promise.all([getTranslations('info'), getFormatter()]);
  const doc = legalDoc(slug, locale as Locale);
  if (!doc) {
    return (
      <PageShell title={t(slug)}>
        <EmptyState
          icon={<FileText />}
          title={t('emptyTitle')}
          description={t('emptyDescription')}
        />
      </PageShell>
    );
  }
  return (
    <PageShell title={t(slug)}>
      <article className="mx-auto flex max-w-3xl flex-col gap-6">
        <p
          role="note"
          className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
          data-testid="legal-draft"
        >
          {t('draftNotice')}
        </p>
        <p className="text-sm text-muted-foreground">
          {t('updated', { date: format.dateTime(new Date(doc.updated), { dateStyle: 'long' }) })}
        </p>
        {doc.sections.map((section) => (
          <section key={section.heading} className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="leading-relaxed">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </article>
    </PageShell>
  );
}
