'use client';

import type { SellerOrderStatus } from '@uzgo/contracts';
import { Button } from '@uzgo/ui/components/button';
import { toast } from '@uzgo/ui/components/toast';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { FormError, Textarea } from '@/components/panel/form-controls';
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
  const id = useId();
  const [pending, setPending] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (allowed.length === 0) return null;

  async function run(to: SellerOrderStatus, reason?: string) {
    setPending(true);
    setError(null);
    try {
      await apiClient(`/seller/seller-orders/${sellerOrderId}/transition`, {
        method: 'POST',
        body: { to, ...(reason ? { reason } : {}) },
      });
      toast.success(t('saved'));
      setRejecting(false);
      router.refresh();
    } catch (err) {
      if (reason) setError(errorMessage(err));
      else toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  if (rejecting) {
    return (
      <form
        className="flex w-full flex-col gap-2"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void run('RETURN_REJECTED', note.trim());
        }}
      >
        <label htmlFor={`${id}-note`} className="text-sm font-medium">
          {t('returnRejectNote')}
        </label>
        <Textarea
          id={`${id}-note`}
          required
          minLength={3}
          maxLength={300}
          className="min-h-20"
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
          }}
          aria-describedby={`${id}-error`}
        />
        <FormError id={`${id}-error`} message={error} />
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={pending || note.trim().length < 3}>
            {t('action_RETURN_REJECTED')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setRejecting(false);
            }}
          >
            {t('cancel')}
          </Button>
        </div>
      </form>
    );
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
          onClick={() => {
            if (to === 'RETURN_REJECTED') setRejecting(true);
            else void run(to);
          }}
        >
          {t.has(`action_${to}`) ? t(`action_${to}`) : to}
        </Button>
      ))}
    </div>
  );
}
