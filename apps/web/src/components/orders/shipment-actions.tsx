'use client';

import { RETURN_REASONS, type ReturnReason, type SellerOrderStatus } from '@uzgo/contracts';
import { Button } from '@uzgo/ui/components/button';
import { toast } from '@uzgo/ui/components/toast';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { FormError, NativeSelect, Textarea } from '@/components/panel/form-controls';
import { useRouter } from '@/i18n/navigation';
import { ApiClientError, apiClient } from '@/lib/api-client';

const CUSTOMER_ACTIONS = new Set<SellerOrderStatus>(['CANCELLED_BY_CUSTOMER', 'RETURN_REQUESTED']);

/** Customer actions offered by the server for one shipment; a return asks for a reason first. */
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
  const id = useId();
  const [pending, setPending] = useState(false);
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState<ReturnReason | ''>('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const actions = allowed.filter((s) => CUSTOMER_ACTIONS.has(s));
  if (actions.length === 0) return null;

  async function run(body: Record<string, unknown>) {
    setPending(true);
    setError(null);
    try {
      await apiClient(`/orders/${orderNumber}/seller-orders/${sellerOrderId}/transition`, {
        method: 'POST',
        body,
      });
      toast.success(t('orders.updated'));
      setReturning(false);
      router.refresh();
    } catch (err) {
      const code = err instanceof ApiClientError ? err.code : '';
      const message = t.has(`returns.error_${code}`)
        ? t(`returns.error_${code}`)
        : t('auth.error_generic');
      if (returning) setError(message);
      else toast.error(message);
    } finally {
      setPending(false);
    }
  }

  if (returning) {
    const ready = reason !== '' && comment.trim().length >= 5;
    return (
      <form
        className="flex w-full flex-col gap-3"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) {
            void run({
              to: 'RETURN_REQUESTED',
              returnReason: reason,
              returnComment: comment.trim(),
            });
          }
        }}
        data-testid="return-form"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-reason`} className="text-sm font-medium">
            {t('returns.reasonLabel')}
          </label>
          <NativeSelect
            id={`${id}-reason`}
            required
            value={reason}
            onChange={(event) => {
              setReason(event.target.value as ReturnReason);
            }}
          >
            <option value="" disabled>
              {t('returns.choose')}
            </option>
            {RETURN_REASONS.map((r) => (
              <option key={r} value={r}>
                {t(`returns.reason_${r}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-comment`} className="text-sm font-medium">
            {t('returns.commentLabel')}
          </label>
          <Textarea
            id={`${id}-comment`}
            required
            minLength={5}
            maxLength={500}
            className="min-h-20"
            value={comment}
            onChange={(event) => {
              setComment(event.target.value);
            }}
            aria-describedby={`${id}-hint ${id}-error`}
          />
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {t('returns.commentHint')}
          </p>
        </div>
        <FormError id={`${id}-error`} message={error} />
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={pending || !ready}>
            {t('returns.submit')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setReturning(false);
            }}
          >
            {t('returns.cancel')}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex gap-2">
      {actions.map((to) => (
        <Button
          key={to}
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => {
            if (to === 'RETURN_REQUESTED') setReturning(true);
            else void run({ to });
          }}
        >
          {t(`orders.action_${to}`)}
        </Button>
      ))}
    </div>
  );
}
