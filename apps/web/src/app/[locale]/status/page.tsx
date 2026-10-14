import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { HealthStatus } from '@/components/health-status';
import { PageShell } from '@/components/page-shell';
import { getApiHealth } from '@/lib/api-health';
import { getServerEnv } from '@/lib/server-env';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('status');
  return { title: t('title') };
}

/** Technical page: live API and database status (Phase 1 check, kept for operators). */
export default async function StatusPage() {
  // Always render at request time: the status must be live, never prerendered.
  await connection();
  const [t, health] = await Promise.all([
    getTranslations('status'),
    getApiHealth(getServerEnv().API_INTERNAL_URL),
  ]);
  return (
    <PageShell title={t('title')}>
      <HealthStatus health={health} label={t(health.state)} />
    </PageShell>
  );
}
