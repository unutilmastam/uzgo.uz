import '@fontsource-variable/onest';
import '../globals.css';
import { Toaster } from '@uzgo/ui/components/toast';
import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { themeInitScript } from '@/components/theme';
import { routing } from '@/i18n/routing';
import { getServerEnv } from '@/lib/server-env';

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return {
    title: { default: t('title'), template: `%s · UZGO` },
    description: t('description'),
    metadataBase: new URL(getServerEnv().PUBLIC_SITE_URL),
    // Not public yet: keep search engines out until launch (Phase 7).
    ...(getServerEnv().PUBLIC_INDEXING ? {} : { robots: { index: false, follow: false } }),
    alternates: { languages: { uz: '/uz', ru: '/ru' } },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0c1018' },
  ],
};

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations('common');

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-dvh flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] antialiased md:pb-0">
        <NextIntlClientProvider>
          <a
            href="#main"
            className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
          >
            {t('skipToContent')}
          </a>
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
          <MobileBottomNav />
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
