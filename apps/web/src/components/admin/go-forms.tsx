'use client';

import type { DriverStatus, RideClass } from '@uzgo/contracts';
import { Button } from '@uzgo/ui/components/button';
import { Input } from '@uzgo/ui/components/input';
import { toast } from '@uzgo/ui/components/toast';
import { parseSomInput, somInputValue } from '@uzgo/ui/lib/money';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { FormError, NativeSelect } from '@/components/panel/form-controls';
import { useErrorMessage } from '@/components/panel/use-error-message';
import { useRouter } from '@/i18n/navigation';
import { apiClient } from '@/lib/api-client';

function useAction() {
  const t = useTranslations('admin');
  const errorMessage = useErrorMessage('admin');
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>, after?: () => void) => {
    setPending(true);
    setError(null);
    try {
      await action();
      toast.success(t('done'));
      after?.();
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };
  return { pending, error, setError, run };
}

/** Staff decide on a driver application: approve (with car class) or reject with a note. */
export function DriverReview({ userId, rideClass }: { userId: string; rideClass: RideClass }) {
  const t = useTranslations();
  const id = useId();
  const { pending, error, setError, run } = useAction();
  const [note, setNote] = useState('');
  const [cls, setCls] = useState<RideClass>(rideClass);
  const review = (decision: 'APPROVE' | 'REJECT') => {
    if (decision === 'REJECT' && !note.trim()) {
      setError(t('admin.driverNoteRequired'));
      return;
    }
    void run(() =>
      apiClient(`/admin/drivers/${userId}/review`, {
        method: 'POST',
        body: {
          decision,
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(decision === 'APPROVE' ? { rideClass: cls } : {}),
        },
      }),
    );
  };
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label htmlFor={`${id}-class`} className="sr-only">
        {t('driver.rideClass')}
      </label>
      <NativeSelect
        id={`${id}-class`}
        className="w-36"
        value={cls}
        onChange={(e) => {
          setCls(e.target.value as RideClass);
        }}
      >
        <option value="ECONOMY">{t('go.class_ECONOMY')}</option>
        <option value="COMFORT">{t('go.class_COMFORT')}</option>
      </NativeSelect>
      <Button
        size="sm"
        disabled={pending}
        onClick={() => {
          review('APPROVE');
        }}
      >
        {t('admin.driverApprove')}
      </Button>
      <label htmlFor={`${id}-note`} className="sr-only">
        {t('admin.driverNote')}
      </label>
      <Input
        id={`${id}-note`}
        className="w-56"
        placeholder={t('admin.driverNote')}
        maxLength={300}
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
        }}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => {
          review('REJECT');
        }}
      >
        {t('admin.driverReject')}
      </Button>
      <FormError id={`${id}-error`} message={error} />
    </div>
  );
}

/** Suspend / reactivate an approved driver and settle their balance. */
export function DriverActions({
  userId,
  status,
  balanceTiyin,
}: {
  userId: string;
  status: Extract<DriverStatus, 'ACTIVE' | 'SUSPENDED'>;
  balanceTiyin: string;
}) {
  const t = useTranslations('admin');
  const id = useId();
  const { pending, error, setError, run } = useAction();
  const [amount, setAmount] = useState('');
  const balance = BigInt(balanceTiyin);
  const settle = (sign: 1n | -1n) => {
    const tiyin = parseSomInput(amount);
    if (!tiyin || tiyin === '0') {
      setError(t('foodCheckFields'));
      return;
    }
    void run(
      () =>
        apiClient(`/admin/drivers/${userId}/settlements`, {
          method: 'POST',
          body: { amountTiyin: (BigInt(tiyin) * sign).toString() },
        }),
      () => {
        setAmount('');
      },
    );
  };
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          void run(() =>
            apiClient(`/admin/drivers/${userId}`, {
              method: 'PATCH',
              body: { status: status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' },
            }),
          )
        }
      >
        {status === 'ACTIVE' ? t('foodSuspend') : t('foodActivate')}
      </Button>
      {balance !== 0n ? (
        <>
          <label htmlFor={`${id}-amount`} className="sr-only">
            {t('courierAmount')}
          </label>
          <Input
            id={`${id}-amount`}
            className="w-32"
            inputMode="decimal"
            placeholder={somInputValue((balance < 0n ? -balance : balance).toString())}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
            }}
          />
          <Button
            size="sm"
            disabled={pending}
            onClick={() => {
              settle(balance < 0n ? -1n : 1n);
            }}
          >
            {balance < 0n ? t('driverCashIn') : t('courierPayout')}
          </Button>
        </>
      ) : null}
      <FormError id={`${id}-error`} message={error} />
    </div>
  );
}

/** Staff cancel an open ride with a reason (a paid ride is refunded in full). */
export function RideCancel({ number }: { number: string }) {
  const t = useTranslations('admin');
  const id = useId();
  const { pending, error, run } = useAction();
  const [reason, setReason] = useState('');
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label htmlFor={`${id}-reason`} className="sr-only">
        {t('rideCancelReason')}
      </label>
      <Input
        id={`${id}-reason`}
        className="w-56"
        placeholder={t('rideCancelReason')}
        maxLength={300}
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
        }}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={pending || !reason.trim()}
        onClick={() =>
          void run(() =>
            apiClient(`/admin/rides/${number}/cancel`, {
              method: 'POST',
              body: { reason: reason.trim() },
            }),
          )
        }
      >
        {t('rideCancel')}
      </Button>
      <FormError id={`${id}-error`} message={error} />
    </div>
  );
}
