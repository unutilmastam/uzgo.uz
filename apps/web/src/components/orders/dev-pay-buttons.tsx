'use client';

import { Button } from '@uzgo/ui/components/button';
import { toast } from '@uzgo/ui/components/toast';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { apiClient } from '@/lib/api-client';

/** DEVELOPMENT ONLY: simulates the provider's success or failure. */
export function DevPayButtons({ orderNumber, payable }: { orderNumber: string; payable: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function run(outcome: 'success' | 'cancel') {
    setPending(true);
    try {
      await apiClient(`/payments/dev/${orderNumber}`, { method: 'POST', body: { outcome } });
      router.replace(`/orders/${orderNumber}`);
      router.refresh();
    } catch {
      toast.error(t('auth.error_generic'));
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {payable ? (
        <>
          <Button variant="accent" size="lg" disabled={pending} onClick={() => void run('success')}>
            {t('devPay.pay')}
          </Button>
          <Button variant="outline" disabled={pending} onClick={() => void run('cancel')}>
            {t('devPay.fail')}
          </Button>
        </>
      ) : null}
      <Button asChild variant="ghost">
        <Link href={`/orders/${orderNumber}`}>{t('devPay.back')}</Link>
      </Button>
    </div>
  );
}
