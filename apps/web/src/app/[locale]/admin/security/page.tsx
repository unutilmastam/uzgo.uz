import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { TotpSetup } from '@/components/admin/totp-setup';
import { getTotpStatus } from '@/lib/admin-api';
import { requireStaff } from '../staff';

export default async function AdminSecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  await requireStaff('/admin/security');
  const [t, status, { next }] = await Promise.all([
    getTranslations('admin'),
    getTotpStatus(),
    searchParams,
  ]);
  if (!status) notFound();
  return (
    <section
      aria-labelledby="totp"
      className="max-w-2xl rounded-xl border border-border bg-card p-5 md:p-6"
    >
      <h2 id="totp" className="mb-4 text-lg font-semibold">
        {status.enabled && !status.sessionVerified ? t('verifyTitle') : t('securityTitle')}
      </h2>
      <TotpSetup status={status} next={next} />
    </section>
  );
}
