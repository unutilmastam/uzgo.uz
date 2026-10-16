import type { SellerStore } from '@uzgo/contracts';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/require-user';
import { getSellerStore } from '@/lib/seller-api';

const storeIdSchema = z.uuid();

/** Resolves the store for a seller page: login required; non-members get a 404. */
export async function loadSellerStore(
  storeId: string,
  next: string,
): Promise<{ store: SellerStore; readOnly: boolean }> {
  if (!storeIdSchema.safeParse(storeId).success) notFound();
  await requireUser(next);
  const store = await getSellerStore(storeId);
  // Restaurants have their own panel (/restaurant/:id), not the shop pages.
  if (!store || store.kind !== 'SHOP') notFound();
  return { store, readOnly: store.status !== 'ACTIVE' && store.status !== 'PENDING' };
}
