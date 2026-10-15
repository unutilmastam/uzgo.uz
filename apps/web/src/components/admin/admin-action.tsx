'use client';

import { Button, type ButtonProps } from '@uzgo/ui/components/button';
import { toast } from '@uzgo/ui/components/toast';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { FormError, Textarea } from '@/components/panel/form-controls';
import { useErrorMessage } from '@/components/panel/use-error-message';
import { useRouter } from '@/i18n/navigation';
import { apiClient } from '@/lib/api-client';

/**
 * One staff action (POST). With `withReason`, asks for a reason first; the
 * reason is stored in the audit log and, for rejections, shown to the seller.
 */
export function AdminAction({
  path,
  label,
  body,
  withReason = false,
  field = 'reason',
  fieldLabel,
  variant = 'outline',
}: {
  path: string;
  label: string;
  body?: Record<string, unknown>;
  /** Ask for a text first (sent as `field`, default "reason"). */
  withReason?: boolean;
  field?: string;
  fieldLabel?: string;
  variant?: ButtonProps['variant'];
}) {
  const t = useTranslations('admin');
  const errorMessage = useErrorMessage('admin');
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    try {
      await apiClient(path, {
        method: 'POST',
        body: withReason ? { ...body, [field]: reason.trim() } : (body ?? {}),
      });
      toast.success(t('done'));
      setOpen(false);
      setReason('');
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  if (withReason && open) {
    return (
      <form
        className="flex w-full flex-col gap-2"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        <label htmlFor={`${id}-reason`} className="text-sm font-medium">
          {fieldLabel ?? t('reason')}
        </label>
        <Textarea
          id={`${id}-reason`}
          required
          minLength={3}
          maxLength={500}
          className="min-h-20"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
          }}
        />
        <FormError id={`${id}-error`} message={error} />
        <div className="flex gap-2">
          <Button
            type="submit"
            size="sm"
            variant={variant}
            disabled={pending || reason.trim().length < 3}
          >
            {label}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setOpen(false);
            }}
          >
            {t('cancel')}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        size="sm"
        variant={variant}
        disabled={pending}
        onClick={() => {
          if (withReason) setOpen(true);
          else void run();
        }}
      >
        {label}
      </Button>
      <FormError id={`${id}-error`} message={error} />
    </div>
  );
}
