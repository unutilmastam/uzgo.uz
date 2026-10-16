import { assistantStatusSchema } from '@uzgo/contracts';
import { Button } from '@uzgo/ui/components/button';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AssistantChat } from '@/components/assistant/assistant-chat';
import { PageShell } from '@/components/page-shell';
import { Link } from '@/i18n/navigation';
import { apiFetch, getCurrentUser } from '@/lib/api-server';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('assistant');
  return { title: t('title'), description: t('description'), robots: { index: false } };
}

async function getStatus() {
  try {
    const res = await apiFetch('/assistant/status');
    return res.ok ? assistantStatusSchema.parse(await res.json()) : null;
  } catch {
    return null;
  }
}

/** UZGO assistant: finds and compares products, restaurants and dishes (ADR 0026). */
export default async function AssistantPage({ searchParams }: Props) {
  const [t, user, status, params] = await Promise.all([
    getTranslations('assistant'),
    getCurrentUser(),
    getStatus(),
    searchParams,
  ]);
  const q = typeof params.q === 'string' ? params.q.slice(0, 200) : undefined;
  return (
    <PageShell title={t('title')}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <p className="-mt-3 text-muted-foreground">{t('description')}</p>
        {!status?.enabled ? (
          <p className="rounded-xl border border-border bg-card p-5" data-testid="assistant-off">
            {t('off')}
          </p>
        ) : !user ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-5">
            <p>{t('loginHint')}</p>
            <Button asChild>
              <Link href={{ pathname: '/login', query: { next: '/assistant' } }}>{t('login')}</Link>
            </Button>
          </div>
        ) : (
          <AssistantChat initialQuestion={q} remainingToday={status.remainingToday} />
        )}
      </div>
    </PageShell>
  );
}
