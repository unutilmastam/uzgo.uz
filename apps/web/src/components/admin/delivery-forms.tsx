'use client';

import { Badge } from '@uzgo/ui/components/badge';
import { Button } from '@uzgo/ui/components/button';
import { Input } from '@uzgo/ui/components/input';
import { toast } from '@uzgo/ui/components/toast';
import { parseSomInput, somInputValue } from '@uzgo/ui/lib/money';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { Field, FormError, NativeSelect } from '@/components/panel/form-controls';
import { useErrorMessage } from '@/components/panel/use-error-message';
import { useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { apiClient } from '@/lib/api-client';
import type { AdminPickupPoint, AdminZoneRow } from '@/lib/admin-api';

function useMutation() {
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

/** One district's courier tariff (prices typed in soʻm, sent as tiyin). */
export function ZoneRow({ row }: { row: AdminZoneRow }) {
  const t = useTranslations('admin');
  const locale = useLocale() as Locale;
  const id = useId();
  const { pending, error, setError, run } = useMutation();
  const [form, setForm] = useState({
    fee: row.zone ? somInputValue(row.zone.feeTiyin) : '',
    freeFrom: row.zone?.freeFromTiyin ? somInputValue(row.zone.freeFromTiyin) : '',
    min: String(row.zone?.etaDaysMin ?? 1),
    max: String(row.zone?.etaDaysMax ?? 3),
    active: row.zone?.active ?? true,
  });

  function save() {
    const fee = parseSomInput(form.fee || '0');
    const freeFrom = form.freeFrom.trim() ? parseSomInput(form.freeFrom) : null;
    if (fee === null || (form.freeFrom.trim() && !freeFrom)) {
      setError(t('error_VALIDATION_FAILED'));
      return;
    }
    void run(() =>
      apiClient(`/admin/delivery/zones/${row.districtId}`, {
        method: 'PUT',
        body: {
          feeTiyin: fee,
          freeFromTiyin: freeFrom,
          etaDaysMin: Number(form.min),
          etaDaysMax: Number(form.max),
          active: form.active,
        },
      }),
    );
  }

  return (
    <li className="flex flex-col gap-2 p-4" data-testid="zone-row">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{row.name[locale]}</span>
        {row.zone ? (
          <Badge variant={row.zone.active ? 'accent' : 'muted'}>
            {row.zone.active ? t('active') : t('inactive')}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">{t('noZone')}</span>
        )}
      </div>
      <form
        className="grid gap-2 sm:grid-cols-[1fr_1fr_6rem_6rem_auto_auto] sm:items-end"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <Field id={`${id}-fee`} label={t('fee')}>
          <Input
            id={`${id}-fee`}
            inputMode="decimal"
            value={form.fee}
            onChange={(e) => {
              setForm({ ...form, fee: e.target.value });
            }}
          />
        </Field>
        <Field id={`${id}-free`} label={t('freeFrom')}>
          <Input
            id={`${id}-free`}
            inputMode="decimal"
            value={form.freeFrom}
            onChange={(e) => {
              setForm({ ...form, freeFrom: e.target.value });
            }}
          />
        </Field>
        <Field id={`${id}-min`} label={t('etaMin')}>
          <Input
            id={`${id}-min`}
            type="number"
            min={0}
            max={60}
            value={form.min}
            onChange={(e) => {
              setForm({ ...form, min: e.target.value });
            }}
          />
        </Field>
        <Field id={`${id}-max`} label={t('etaMax')}>
          <Input
            id={`${id}-max`}
            type="number"
            min={0}
            max={60}
            value={form.max}
            onChange={(e) => {
              setForm({ ...form, max: e.target.value });
            }}
          />
        </Field>
        <label className="flex h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={form.active}
            onChange={(e) => {
              setForm({ ...form, active: e.target.checked });
            }}
          />
          {t('active')}
        </label>
        <Button type="submit" size="sm" disabled={pending}>
          {t('save')}
        </Button>
      </form>
      <FormError id={`${id}-error`} message={error} />
    </li>
  );
}

export function PickupPointForm({ districts }: { districts: { id: string; name: string }[] }) {
  const t = useTranslations('admin');
  const id = useId();
  const { pending, error, run } = useMutation();
  const empty = { districtId: '', uz: '', ru: '', address: '', hours: '', phone: '' };
  const [form, setForm] = useState(empty);
  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void run(() =>
          apiClient('/admin/delivery/pickup-points', {
            method: 'POST',
            body: {
              districtId: form.districtId,
              name: { uz: form.uz.trim(), ru: form.ru.trim() },
              address: form.address.trim(),
              hours: form.hours.trim() || null,
              phone: form.phone.trim() || null,
              active: true,
            },
          }),
        ).then((ok) => {
          if (ok) setForm(empty);
        });
      }}
    >
      <Field id={`${id}-d`} label={t('district')}>
        <NativeSelect
          id={`${id}-d`}
          value={form.districtId}
          onChange={(e) => {
            setForm({ ...form, districtId: e.target.value });
          }}
        >
          <option value="" disabled>
            {t('district')}
          </option>
          {districts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id={`${id}-uz`} label={t('nameUz')}>
        <Input
          id={`${id}-uz`}
          maxLength={100}
          value={form.uz}
          onChange={(e) => {
            setForm({ ...form, uz: e.target.value });
          }}
        />
      </Field>
      <Field id={`${id}-ru`} label={t('nameRu')}>
        <Input
          id={`${id}-ru`}
          maxLength={100}
          value={form.ru}
          onChange={(e) => {
            setForm({ ...form, ru: e.target.value });
          }}
        />
      </Field>
      <Field id={`${id}-a`} label={t('address')} className="sm:col-span-3">
        <Input
          id={`${id}-a`}
          maxLength={200}
          value={form.address}
          onChange={(e) => {
            setForm({ ...form, address: e.target.value });
          }}
        />
      </Field>
      <Field id={`${id}-h`} label={t('hours')}>
        <Input
          id={`${id}-h`}
          maxLength={100}
          value={form.hours}
          onChange={(e) => {
            setForm({ ...form, hours: e.target.value });
          }}
        />
      </Field>
      <Field id={`${id}-p`} label={t('phone')}>
        <Input
          id={`${id}-p`}
          type="tel"
          maxLength={20}
          value={form.phone}
          onChange={(e) => {
            setForm({ ...form, phone: e.target.value });
          }}
        />
      </Field>
      <div className="flex flex-col gap-2 sm:col-span-3">
        <FormError id={`${id}-error`} message={error} />
        <Button type="submit" className="w-fit" disabled={pending || !form.districtId}>
          {t('create')}
        </Button>
      </div>
    </form>
  );
}

export function PickupPointRow({
  point,
  districtName,
}: {
  point: AdminPickupPoint;
  districtName: string;
}) {
  const t = useTranslations('admin');
  const locale = useLocale() as Locale;
  const { pending, run } = useMutation();
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
      <span>
        <span className="font-medium">{point.name[locale]}</span>
        <span className="block text-muted-foreground">
          {[districtName, point.address, point.hours].filter(Boolean).join(' · ')}
        </span>
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          void run(() =>
            apiClient(`/admin/delivery/pickup-points/${point.id}`, {
              method: 'PATCH',
              body: { active: !point.active },
            }),
          )
        }
      >
        {point.active ? t('hide') : t('show')}
      </Button>
    </li>
  );
}
