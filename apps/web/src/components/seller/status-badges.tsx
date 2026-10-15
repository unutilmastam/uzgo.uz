import type { ProductStatus, StoreStatus } from '@uzgo/contracts';
import { Badge } from '@uzgo/ui/components/badge';
import { getTranslations } from 'next-intl/server';

const STORE = {
  PENDING: 'secondary',
  ACTIVE: 'accent',
  REJECTED: 'sale',
  SUSPENDED: 'muted',
} as const satisfies Record<StoreStatus, string>;

const PRODUCT = {
  DRAFT: 'outline',
  PENDING_REVIEW: 'secondary',
  APPROVED: 'accent',
  REJECTED: 'sale',
  ARCHIVED: 'muted',
} as const satisfies Record<ProductStatus, string>;

export async function StoreStatusBadge({ status }: { status: StoreStatus }) {
  const t = await getTranslations('seller');
  return <Badge variant={STORE[status]}>{t(`storeStatus_${status}`)}</Badge>;
}

export async function ProductStatusBadge({ status }: { status: ProductStatus }) {
  const t = await getTranslations('seller');
  return <Badge variant={PRODUCT[status]}>{t(`ps_${status}`)}</Badge>;
}
