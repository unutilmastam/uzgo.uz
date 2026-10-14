import { EmptyState } from '@uzgo/ui/components/empty-state';
import { UserRound } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageShell } from '@/components/page-shell';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('account');
  return { title: t('title') };
}

/** Phone + OTP login arrives in Phase 3. */
export default async function AccountPage() {
  const t = await getTranslations('account');
  return (
    <PageShell title={t('title')}>
      <EmptyState
        icon={<UserRound />}
        title={t('emptyTitle')}
        description={t('emptyDescription')}
      />
    </PageShell>
  );
}
