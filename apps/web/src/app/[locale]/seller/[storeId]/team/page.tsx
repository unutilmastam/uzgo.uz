import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { TeamManager } from '@/components/seller/team-manager';
import { getStoreMembers } from '@/lib/seller-api';
import { loadSellerStore } from '../store-context';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('seller');
  return { title: t('team'), robots: { index: false } };
}

/** Owner only (the API enforces it too). */
export default async function SellerTeamPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const { store } = await loadSellerStore(storeId, `/seller/${storeId}/team`);
  if (store.myRole !== 'OWNER') notFound();
  const members = await getStoreMembers(store.id);
  if (!members) notFound();
  return (
    <div className="max-w-3xl">
      <TeamManager storeId={store.id} members={members} />
    </div>
  );
}
