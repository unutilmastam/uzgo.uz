'use client';

import { Button } from '@uzgo/ui/components/button';
import { toast } from '@uzgo/ui/components/toast';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { apiClient } from '@/lib/api-client';

/** Unpaid online order: go to the provider's page, or cancel the whole order. */
export function PaymentActions({ orderNumber }: { orderNumber: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function pay() {
    setPending(true);
    try {
      const { url } = await apiClient<{ url: string }>(
        `/orders/${orderNumber}/payment-link?locale=${locale}`,
      );
      window.location.assign(url);
    } catch {
      toast.error(t('auth.error_generic'));
      setPending(false);
      router.refresh();
    }
  }

  async function cancel() {
    setPending(true);
    try {
      await apiClient(`/orders/${orderNumber}/cancel`, { method: 'POST' });
      toast.success(t('orders.orderCancelled'));
      router.refresh();
    } catch {
      toast.error(t('auth.error_generic'));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="accent" disabled={pending} onClick={() => void pay()}>
        {t('orders.payNow')}
      </Button>
      <Button variant="outline" disabled={pending} onClick={() => void cancel()}>
        {t('orders.cancelOrder')}
      </Button>
    </div>
  );
}
