'use client';

import type { PayoutDetails } from '@uzgo/contracts';
import { Button } from '@uzgo/ui/components/button';
import { Input } from '@uzgo/ui/components/input';
import { toast } from '@uzgo/ui/components/toast';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { Field, FormError } from '@/components/panel/form-controls';
import { useErrorMessage } from '@/components/panel/use-error-message';
import { useRouter } from '@/i18n/navigation';
import { apiClient } from '@/lib/api-client';

/** Owner's bank details for payouts. Validated again by the API. */
export function PayoutDetailsForm({
  storeId,
  initial,
}: {
  storeId: string;
  initial: PayoutDetails | null;
}) {
  const t = useTranslations('seller');
  const errorMessage = useErrorMessage('seller');
  const router = useRouter();
  const id = useId();
  const [form, setForm] = useState<PayoutDetails>(
    initial ?? { bankName: '', mfo: '', account: '', recipient: '' },
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setError(null);
    try {
      await apiClient(`/seller/stores/${storeId}/payout-details`, {
        method: 'PUT',
        body: {
          bankName: form.bankName.trim(),
          mfo: form.mfo.trim(),
          account: form.account.trim(),
          recipient: form.recipient.trim(),
        },
      });
      toast.success(t('saved'));
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  const input = (key: keyof PayoutDetails, label: string, digits?: number) => (
    <Field id={`${id}-${key}`} label={label}>
      <Input
        id={`${id}-${key}`}
        value={form[key]}
        maxLength={digits ?? 160}
        inputMode={digits ? 'numeric' : undefined}
        onChange={(e) => {
          setForm({ ...form, [key]: digits ? e.target.value.replace(/\D/g, '') : e.target.value });
        }}
      />
    </Field>
  );

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {input('bankName', t('bankName'))}
      {input('mfo', t('mfo'), 5)}
      {input('account', t('account'), 20)}
      {input('recipient', t('recipient'))}
      <div className="flex flex-col gap-2 sm:col-span-2">
        <FormError id={`${id}-error`} message={error} />
        <Button type="submit" className="w-fit" disabled={pending}>
          {t('save')}
        </Button>
      </div>
    </form>
  );
}

/** Store Telegram chat for new-order messages (empty = off). */
export function TelegramForm({ storeId }: { storeId: string }) {
  const t = useTranslations('seller');
  const errorMessage = useErrorMessage('seller');
  const id = useId();
  const [chatId, setChatId] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setError(null);
    try {
      await apiClient(`/seller/stores/${storeId}/notifications`, {
        method: 'PUT',
        body: { telegramChatId: chatId.trim() || null },
      });
      toast.success(t('saved'));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Field
        id={`${id}-chat`}
        label={t('telegramChatId')}
        hint={t('telegramHint')}
        className="sm:w-96"
      >
        <Input
          id={`${id}-chat`}
          inputMode="numeric"
          maxLength={21}
          aria-describedby={`${id}-chat-hint`}
          value={chatId}
          onChange={(e) => {
            setChatId(e.target.value.replace(/[^\d-]/g, ''));
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
