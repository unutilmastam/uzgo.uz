'use client';

import { Button } from '@uzgo/ui/components/button';
import { Input } from '@uzgo/ui/components/input';
import { toast } from '@uzgo/ui/components/toast';
import { parseSomInput } from '@uzgo/ui/lib/money';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { Field, FormError, NativeSelect } from '@/components/panel/form-controls';
import { useErrorMessage } from '@/components/panel/use-error-message';
import { useRouter } from '@/i18n/navigation';
import { apiClient } from '@/lib/api-client';

/** Tashkent is UTC+5 all year: a date input day ends at 23:59:59 local time. */
const endOfTashkentDay = (date: string) => new Date(`${date}T23:59:59+05:00`).toISOString();
const startOfTashkentDay = (date: string) => new Date(`${date}T00:00:00+05:00`).toISOString();

/** New promo code. Terms are fixed after creation (orders refer to them). */
export function PromoCreateForm() {
  const t = useTranslations('admin');
  const errorMessage = useErrorMessage('admin');
  const router = useRouter();
  const id = useId();
  const [kind, setKind] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [fields, setFields] = useState({
    code: '',
    percent: '',
    amount: '',
    max: '',
    min: '',
    startsAt: '',
    endsAt: '',
    usageLimit: '',
    perUserLimit: '1',
    description: '',
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof fields) => (event: { target: { value: string } }) => {
    setFields((f) => ({ ...f, [key]: event.target.value }));
  };

  async function submit() {
    setError(null);
    const percent = Number(fields.percent.replace(',', '.'));
    const amount = parseSomInput(fields.amount);
    const max = fields.max.trim() ? parseSomInput(fields.max) : undefined;
    const min = fields.min.trim() ? parseSomInput(fields.min) : '0';
    if (
      (kind === 'PERCENT' && !(percent > 0 && percent <= 90)) ||
      (kind === 'FIXED' && !amount) ||
      max === null ||
      min === null
    ) {
      setError(t('promoInvalidTerms'));
      return;
    }
    setPending(true);
    try {
      await apiClient('/admin/promo-codes', {
        method: 'POST',
        body: {
          code: fields.code.trim(),
          kind,
          ...(kind === 'PERCENT'
            ? { percentBp: Math.round(percent * 100), ...(max ? { maxDiscountTiyin: max } : {}) }
            : { amountTiyin: amount }),
          minOrderTiyin: min,
          ...(fields.startsAt ? { startsAt: startOfTashkentDay(fields.startsAt) } : {}),
          ...(fields.endsAt ? { endsAt: endOfTashkentDay(fields.endsAt) } : {}),
          ...(fields.usageLimit ? { usageLimit: Number(fields.usageLimit) } : {}),
          perUserLimit: Number(fields.perUserLimit) || 1,
          ...(fields.description.trim() ? { description: fields.description.trim() } : {}),
        },
      });
      toast.success(t('done'));
      setFields((f) => ({ ...f, code: '', description: '' }));
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      data-testid="promo-form"
    >
      <Field id={`${id}-code`} label={t('promoCode')} hint={t('promoCodeHint')}>
        <Input
          id={`${id}-code`}
          value={fields.code}
          onChange={set('code')}
          maxLength={32}
          autoCapitalize="characters"
          required
        />
      </Field>
      <Field id={`${id}-kind`} label={t('promoKind')}>
        <NativeSelect
          id={`${id}-kind`}
          value={kind}
          onChange={(event) => {
            setKind(event.target.value as 'PERCENT' | 'FIXED');
          }}
        >
          <option value="PERCENT">{t('promoKind_PERCENT')}</option>
          <option value="FIXED">{t('promoKind_FIXED')}</option>
        </NativeSelect>
      </Field>
      {kind === 'PERCENT' ? (
        <>
          <Field id={`${id}-percent`} label={t('promoPercent')}>
            <Input
              id={`${id}-percent`}
              inputMode="decimal"
              value={fields.percent}
              onChange={set('percent')}
            />
          </Field>
          <Field id={`${id}-max`} label={t('promoMax')}>
            <Input id={`${id}-max`} inputMode="decimal" value={fields.max} onChange={set('max')} />
          </Field>
        </>
      ) : (
        <Field id={`${id}-amount`} label={t('promoAmount')}>
          <Input
            id={`${id}-amount`}
            inputMode="decimal"
            value={fields.amount}
            onChange={set('amount')}
          />
        </Field>
      )}
      <Field id={`${id}-min`} label={t('promoMin')}>
        <Input id={`${id}-min`} inputMode="decimal" value={fields.min} onChange={set('min')} />
      </Field>
      <Field id={`${id}-starts`} label={t('promoStarts')}>
        <Input id={`${id}-starts`} type="date" value={fields.startsAt} onChange={set('startsAt')} />
      </Field>
      <Field id={`${id}-ends`} label={t('promoEnds')}>
        <Input id={`${id}-ends`} type="date" value={fields.endsAt} onChange={set('endsAt')} />
      </Field>
      <Field id={`${id}-limit`} label={t('promoUsageLimit')}>
        <Input
          id={`${id}-limit`}
          inputMode="numeric"
          value={fields.usageLimit}
          onChange={set('usageLimit')}
        />
      </Field>
      <Field id={`${id}-per-user`} label={t('promoPerUser')}>
        <Input
          id={`${id}-per-user`}
          inputMode="numeric"
          value={fields.perUserLimit}
          onChange={set('perUserLimit')}
        />
      </Field>
      <Field id={`${id}-description`} label={t('promoDescription')} className="sm:col-span-2">
        <Input
          id={`${id}-description`}
          value={fields.description}
          onChange={set('description')}
          maxLength={200}
        />
      </Field>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <FormError id={`${id}-error`} message={error} />
        <Button type="submit" className="self-start" disabled={pending || !fields.code.trim()}>
          {t('promoCreate')}
        </Button>
      </div>
    </form>
  );
}

/** Switch a code on or off (the only change most codes ever need). */
export function PromoToggle({ id, active }: { id: string; active: boolean }) {
  const t = useTranslations('admin');
  const errorMessage = useErrorMessage('admin');
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      size="sm"
      variant={active ? 'outline' : 'primary'}
      disabled={pending}
      onClick={() => {
        setPending(true);
        apiClient(`/admin/promo-codes/${id}`, { method: 'PATCH', body: { active: !active } })
          .then(
            () => {
              toast.success(t('done'));
              router.refresh();
            },
            (err: unknown) => {
              toast.error(errorMessage(err));
            },
          )
          .finally(() => {
            setPending(false);
          });
      }}
    >
      {active ? t('promoDisable') : t('promoEnable')}
    </Button>
  );
}
