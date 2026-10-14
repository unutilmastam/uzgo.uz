'use client';

import type { SellerOrderStatus } from '@uzgo/contracts';
import { Button } from '@uzgo/ui/components/button';
import { toast } from '@uzgo/ui/components/toast';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { apiClient } from '@/lib/api-client';

const CUSTOMER_ACTIONS = new Set<SellerOrderStatus>(['CANCELLED_BY_CUSTOMER', 'RETURN_REQUESTED']);

/** Customer actions offered by the server for one shipment. */
export function ShipmentActions({
  orderNumber,
  sellerOrderId,
  allowed,
}: {
  orderNumber: string;
  sellerOrderId: string;
  allowed: SellerOrderStatus[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const actions = allowed.filter((s) => CUSTOMER_ACTIONS.has(s));
  if (actions.length === 0) return null;

  async function run(to: SellerOrderStatus) {
    setPending(true);
    try {
      await apiClient(`/orders/${orderNumber}/seller-orders/${sellerOrderId}/transition`, {
        method: 'POST',
        body: { to },
      });
      toast.success(t('orders.updated'));
      router.refresh();
    } catch {
      toast.error(t('auth.error_generic'));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex gap-2">
      {actions.map((to) => (
        <Button
          key={to}
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => void run(to)}
        >
          {t(`orders.action_${to}`)}
        </Button>
      ))}
    </div>
  );
}
