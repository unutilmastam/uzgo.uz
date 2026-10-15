import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageShell } from '@/components/page-shell';
import { StoreApplicationForm } from '@/components/seller/store-application-form';
import { getRegions } from '@/lib/api-server';
import { requireUser } from '@/lib/require-user';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('seller');
  return { title: t('applyTitle'), robots: { index: false } };
}

export default async function SellerApplyPage() {
  await requireUser('/seller/apply');
  const [t, regions] = await Promise.all([getTranslations('seller'), getRegions()]);
  return (
    <PageShell title={t('applyTitle')}>
      <div className="max-w-3xl rounded-xl border border-border bg-card p-5 md:p-6">
        <StoreApplicationForm regions={regions} />
      </div>
    </PageShell>
  );
}
