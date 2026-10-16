'use client';

import type { DriverApplicationView } from '@uzgo/contracts';
import { Button } from '@uzgo/ui/components/button';
import { Input } from '@uzgo/ui/components/input';
import { toast } from '@uzgo/ui/components/toast';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { Field, FormError, NativeSelect } from '@/components/panel/form-controls';
import { Link, useRouter } from '@/i18n/navigation';
import { ApiClientError, apiClient } from '@/lib/api-client';

/** Apply as a UZGO Go driver, or correct a rejected application (ADR 0025). */
export function DriverApplicationForm({ current }: { current: DriverApplicationView | null }) {
  const t = useTranslations();
  const router = useRouter();
  const id = useId();
  const [form, setForm] = useState({
    firstName: current?.firstName ?? '',
    lastName: current?.lastName ?? '',
    licenceNumber: current?.licenceNumber ?? '',
    permitNumber: current?.permitNumber ?? '',
    taxId: current?.taxId ?? '',
    carMake: current?.car.make ?? '',
    carModel: current?.car.model ?? '',
    carColor: current?.car.color ?? '',
    carYear: current ? String(current.car.year) : '',
    plateNumber: current?.car.plate ?? '',
    rideClass: current?.rideClass ?? 'ECONOMY',
  });
  const [terms, setTerms] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => {
    setForm({ ...form, [key]: e.target.value });
  };

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await apiClient('/driver/application', {
        method: 'PUT',
        body: {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          licenceNumber: form.licenceNumber,
          ...(form.permitNumber.trim() ? { permitNumber: form.permitNumber.trim() } : {}),
          ...(form.taxId.trim() ? { taxId: form.taxId.trim() } : {}),
          carMake: form.carMake.trim(),
          carModel: form.carModel.trim(),
          carColor: form.carColor.trim(),
          carYear: Number(form.carYear),
          plateNumber: form.plateNumber,
          rideClass: form.rideClass,
          acceptTerms: terms,
        },
      });
      toast.success(t('driver.sent'));
      router.refresh();
    } catch (err) {
      const code = err instanceof ApiClientError ? err.code : '';
      setError(t.has(`driver.error_${code}`) ? t(`driver.error_${code}`) : t('auth.error_generic'));
    } finally {
      setPending(false);
    }
  }

  const year = Number(form.carYear);
  const ready =
    terms &&
    form.firstName.trim() &&
    form.lastName.trim() &&
    form.licenceNumber.trim().length >= 6 &&
    form.carMake.trim() &&
    form.carModel.trim() &&
    form.carColor.trim() &&
    year >= 1980 &&
    form.plateNumber.trim().length >= 7;

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-semibold">{t('driver.aboutYou')}</legend>
        <Field id={`${id}-first`} label={t('driver.firstName')}>
          <Input
            id={`${id}-first`}
            value={form.firstName}
            maxLength={60}
            autoComplete="given-name"
            onChange={set('firstName')}
          />
        </Field>
        <Field id={`${id}-last`} label={t('driver.lastName')}>
          <Input
            id={`${id}-last`}
            value={form.lastName}
            maxLength={60}
            autoComplete="family-name"
            onChange={set('lastName')}
          />
        </Field>
        <Field id={`${id}-licence`} label={t('driver.licence')} hint={t('driver.licenceHint')}>
          <Input
            id={`${id}-licence`}
            value={form.licenceNumber}
            maxLength={20}
            onChange={set('licenceNumber')}
          />
        </Field>
        <Field id={`${id}-permit`} label={t('driver.permit')} hint={t('driver.permitHint')}>
          <Input
            id={`${id}-permit`}
            value={form.permitNumber}
            maxLength={40}
            onChange={set('permitNumber')}
          />
        </Field>
        <Field id={`${id}-tax`} label={t('driver.taxId')} hint={t('driver.taxIdHint')}>
          <Input
            id={`${id}-tax`}
            value={form.taxId}
            inputMode="numeric"
            maxLength={14}
            onChange={set('taxId')}
          />
        </Field>
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-semibold">{t('driver.aboutCar')}</legend>
        <Field id={`${id}-make`} label={t('driver.carMake')}>
          <Input id={`${id}-make`} value={form.carMake} maxLength={40} onChange={set('carMake')} />
        </Field>
        <Field id={`${id}-model`} label={t('driver.carModel')}>
          <Input
            id={`${id}-model`}
            value={form.carModel}
            maxLength={40}
            onChange={set('carModel')}
          />
        </Field>
        <Field id={`${id}-color`} label={t('driver.carColor')}>
          <Input
            id={`${id}-color`}
            value={form.carColor}
            maxLength={30}
            onChange={set('carColor')}
          />
        </Field>
        <Field id={`${id}-year`} label={t('driver.carYear')}>
          <Input
            id={`${id}-year`}
            value={form.carYear}
            inputMode="numeric"
            maxLength={4}
            onChange={set('carYear')}
          />
        </Field>
        <Field id={`${id}-plate`} label={t('driver.plate')} hint={t('driver.plateHint')}>
          <Input
            id={`${id}-plate`}
            value={form.plateNumber}
            maxLength={12}
            className="uppercase"
            onChange={set('plateNumber')}
          />
        </Field>
        <Field id={`${id}-class`} label={t('driver.rideClass')}>
          <NativeSelect id={`${id}-class`} value={form.rideClass} onChange={set('rideClass')}>
            <option value="ECONOMY">{t('go.class_ECONOMY')}</option>
            <option value="COMFORT">{t('go.class_COMFORT')}</option>
          </NativeSelect>
        </Field>
      </fieldset>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={terms}
          onChange={(e) => {
            setTerms(e.target.checked);
          }}
        />
        <span>
          {t.rich('driver.terms', {
            link: (chunks) => (
              <Link href="/info/terms" className="text-primary underline">
                {chunks}
              </Link>
            ),
          })}
        </span>
      </label>
      <FormError id={`${id}-error`} message={error} />
      <Button type="submit" size="lg" disabled={!ready || pending}>
        {current ? t('driver.resend') : t('driver.send')}
      </Button>
    </form>
  );
}
