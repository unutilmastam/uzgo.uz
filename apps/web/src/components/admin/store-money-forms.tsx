'use client';

import { Button } from '@uzgo/ui/components/button';
import { Input } from '@uzgo/ui/components/input';
import { toast } from '@uzgo/ui/components/toast';
import { parseSomInput } from '@uzgo/ui/lib/money';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { Field, FormError } from '@/components/panel/form-controls';
import { useErrorMessage } from '@/components/panel/use-error-message';
import { useRouter } from '@/i18n/navigation';
import { apiClient } from '@/lib/api-client';

function useSubmit() {
  const t = useTranslations('admin');
  const errorMessage = useErrorMessage('admin');
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>) => {
    setPending(true);
    setError(null);
    try {
      await action();
      toast.success(t('done'));
      router.refresh();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setPending(false);
    }
  };
  return { pending, error, setError, run };
}

/** Schedules a payout (amount in soʻm; the API checks the available balance). */
export function CreatePayoutForm({ storeId }: { storeId: string }) {
  const t = useTranslations('admin');
  const id = useId();
  const [amount, setAmount] = useState('');
  const { pending, error, setError, run } = useSubmit();
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const tiyin = parseSomInput(amount);
        if (!tiyin || tiyin === '0') {
          setError(t('error_VALIDATION_FAILED'));
          return;
        }
        void run(() =>
          apiClient(`/admin/stores/${storeId}/payouts`, {
            method: 'POST',
            body: { amountTiyin: tiyin },
          }),
        ).then((ok) => {
          if (ok) setAmount('');
        });
      }}
    >
      <Field id={`${id}-amount`} label={t('amountSom')} className="sm:w-56">
        <Input
          id={`${id}-amount`}
          inputMode="decimal"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
          }}
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {t('createPayout')}
      </Button>
      <FormError id={`${id}-error`} message={error} />
    </form>
  );
}

/** Store commission override in percent (empty = category rules). */
export function CommissionForm({ storeId }: { storeId: string }) {
  const t = useTranslations('admin');
  const id = useId();
  const [percent, setPercent] = useState('');
  const { pending, error, setError, run } = useSubmit();
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const value = percent.trim();
        if (value && !/^\d{1,2}(\.\d{1,2})?$/.test(value)) {
          setError(t('error_VALIDATION_FAILED'));
          return;
        }
        // Basis points with integer arithmetic: "12.5" → 1250.
        const [whole = '0', frac = ''] = value.split('.');
        const bp = value ? Number(whole) * 100 + Number(frac.padEnd(2, '0')) : null;
        void run(() =>
          apiClient(`/admin/stores/${storeId}/commission`, {
            method: 'PATCH',
            body: { commissionBp: bp },
          }),
        );
      }}
    >
      <Field
        id={`${id}-pct`}
        label={t('commission')}
        hint={t('commissionHint')}
        className="sm:w-56"
      >
        <Input
          id={`${id}-pct`}
          inputMode="decimal"
          aria-describedby={`${id}-pct-hint`}
          value={percent}
          onChange={(e) => {
            setPercent(e.target.value);
          }}
        />
      </Field>
      <Button type="submit" variant="outline" disabled={pending}>
        {t('save')}
      </Button>
      <FormError id={`${id}-error`} message={error} />
    </form>
  );
}
