import { Badge } from '@uzgo/ui/components/badge';
import { getTranslations } from 'next-intl/server';

const ORDER_VARIANT = {
  CREATED: 'secondary',
  CONFIRMED: 'primary',
  COMPLETED: 'accent',
  CANCELLED: 'muted',
} as const;

export async function OrderStatusBadge({ status }: { status: keyof typeof ORDER_VARIANT }) {
  const t = await getTranslations('orders');
  return <Badge variant={ORDER_VARIANT[status]}>{t(`status_${status}`)}</Badge>;
}
