'use client';

import { Button } from '@uzgo/ui/components/button';
import { toast } from '@uzgo/ui/components/toast';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { apiClient } from '@/lib/api-client';

/** The rider's buttons on the ride page: pay (online, unpaid) and cancel (before the trip). */
export function RideActions({
  number,
  canPay,
  canCancel,
}: {
  number: string;
  canPay: boolean;
  canCancel: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function pay() {
    setPending(true);
    try {
      const { url } = await apiClient<{ url: string }>(
        `/orders/${number}/payment-link?locale=${locale}`,
      );
      window.location.assign(url);
    } catch {
      toast.error(t('auth.error_generic'));
      setPending(false);
      router.refresh();
    }
  }

  async function cancel() {
    if (!window.confirm(t('go.cancelConfirm'))) return;
    setPending(true);
    try {
      await apiClient(`/rides/${number}/cancel`, { method: 'POST', body: {} });
      toast.success(t('go.cancelled'));
      router.refresh();
    } catch {
      toast.error(t('auth.error_generic'));
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (!canPay && !canCancel) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {canPay ? (
        <Button variant="accent" disabled={pending} onClick={() => void pay()}>
          {t('orders.payNow')}
        </Button>
      ) : null}
      {canCancel ? (
        <Button variant="outline" disabled={pending} onClick={() => void cancel()}>
          {t('go.cancel')}
        </Button>
      ) : null}
    </div>
  );
}
