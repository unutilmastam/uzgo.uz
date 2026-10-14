import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { LoginForm } from '@/components/auth/login-form';
import { redirect } from '@/i18n/navigation';
import { getCurrentUser } from '@/lib/api-server';
import { safeNextPath } from '@/lib/safe-next';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  return { title: t('title') };
}

export default async function LoginPage({ searchParams }: Props) {
  const [t, locale, query] = await Promise.all([
    getTranslations('auth'),
    getLocale(),
    searchParams,
  ]);
  const next = safeNextPath(query.next);
  if (await getCurrentUser()) redirect({ href: next, locale });

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-10 md:py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold md:text-3xl">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm md:p-6">
        <LoginForm next={next} />
      </div>
    </div>
  );
}
