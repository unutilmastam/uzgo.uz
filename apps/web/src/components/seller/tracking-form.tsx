'use client';

import { Button } from '@uzgo/ui/components/button';
import { Input } from '@uzgo/ui/components/input';
import { toast } from '@uzgo/ui/components/toast';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { Field, FormError } from '@/components/panel/form-controls';
import { useErrorMessage } from '@/components/panel/use-error-message';
import { useRouter } from '@/i18n/navigation';
import { apiClient } from '@/lib/api-client';

/** Carrier and tracking code, visible to the customer. */
export function TrackingForm({
  sellerOrderId,
  initial,
}: {
  sellerOrderId: string;
  initial: { carrier: string; code: string } | null;
}) {
  const t = useTranslations('seller');
  const errorMessage = useErrorMessage('seller');
  const router = useRouter();
  const id = useId();
  const [carrier, setCarrier] = useState(initial?.carrier ?? '');
  const [code, setCode] = useState(initial?.code ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setError(null);
    try {
      await apiClient(`/seller/seller-orders/${sellerOrderId}/tracking`, {
        method: 'PATCH',
        body: { carrier: carrier.trim(), trackingCode: code.trim() },
      });
      toast.success(t('saved'));
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Field id={`${id}-carrier`} label={t('carrier')}>
        <Input
          id={`${id}-carrier`}
          maxLength={60}
          value={carrier}
          onChange={(e) => {
            setCarrier(e.target.value);
          }}
        />
      </Field>
      <Field id={`${id}-code`} label={t('trackingCode')}>
        <Input
          id={`${id}-code`}
          maxLength={60}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
          }}
        />
      </Field>
      <Button
        type="submit"
        variant="outline"
        disabled={pending || carrier.trim().length < 2 || code.trim().length < 3}
      >
        {t('saveTracking')}
      </Button>
      <div className="sm:col-span-3">
        <FormError id={`${id}-error`} message={error} />
      </div>
    </form>
  );
}
