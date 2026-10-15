'use client';

import type { SellerOrderStatus } from '@uzgo/contracts';
import { Button } from '@uzgo/ui/components/button';
import { toast } from '@uzgo/ui/components/toast';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useErrorMessage } from '@/components/panel/use-error-message';
import { useRouter } from '@/i18n/navigation';
import { apiClient } from '@/lib/api-client';

/** Next steps the server allows for this shipment (state machine on the server). */
export function ShipmentButtons({
  sellerOrderId,
  allowed,
}: {
  sellerOrderId: string;
  allowed: SellerOrderStatus[];
}) {
  const t = useTranslations('seller');
  const errorMessage = useErrorMessage('seller');
  const router = useRouter();
  const [pending, setPending] = useState(false);
  if (allowed.length === 0) return null;

  async function run(to: SellerOrderStatus) {
    setPending(true);
    try {
      await apiClient(`/seller/seller-orders/${sellerOrderId}/transition`, {
        method: 'POST',
        body: { to },
      });
      toast.success(t('saved'));
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {allowed.map((to) => (
        <Button
          key={to}
          size="sm"
          variant={
            to.startsWith('CANCELLED') || to.endsWith('FAILED') || to === 'RETURN_REJECTED'
              ? 'outline'
              : 'primary'
          }
          disabled={pending}
          onClick={() => void run(to)}
        >
          {t.has(`action_${to}`) ? t(`action_${to}`) : to}
        </Button>
      ))}
    </div>
  );
}
