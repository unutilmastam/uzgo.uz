'use client';

import { LEGAL_TYPES, type LegalType, type Region } from '@uzgo/contracts';
import { Button } from '@uzgo/ui/components/button';
import { Input } from '@uzgo/ui/components/input';
import { toast } from '@uzgo/ui/components/toast';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { DistrictPicker } from '@/components/geo/district-picker';
import { Field, FormError, NativeSelect } from '@/components/panel/form-controls';
import { useErrorMessage } from '@/components/panel/use-error-message';
import { useRouter } from '@/i18n/navigation';
import { apiClient } from '@/lib/api-client';

/** Store application. Every field is validated again on the server. */
export function StoreApplicationForm({ regions }: { regions: Region[] }) {
  const t = useTranslations('seller');
  const errorMessage = useErrorMessage('seller');
  const router = useRouter();
  const id = useId();
  const [form, setForm] = useState({
    nameUz: '',
    nameRu: '',
    slug: '',
    legalType: 'INDIVIDUAL_ENTREPRENEUR' as LegalType,
    legalName: '',
    taxId: '',
    contactPhone: '',
  });
  const [geo, setGeo] = useState({ regionId: '', districtId: '' });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await apiClient('/seller/stores', {
        method: 'POST',
        body: {
          name: { uz: form.nameUz.trim(), ru: form.nameRu.trim() },
          slug: form.slug.trim(),
          districtId: geo.districtId,
          legalType: form.legalType,
          legalName: form.legalName.trim(),
          taxId: form.taxId.trim(),
          contactPhone: form.contactPhone.trim(),
        },
      });
      toast.success(t('applied'));
      router.push('/seller');
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      noValidate
      aria-describedby={error ? `${id}-error` : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Field id={`${id}-name-uz`} label={t('storeNameUz')}>
        <Input
          id={`${id}-name-uz`}
          required
          maxLength={80}
          value={form.nameUz}
          onChange={(e) => {
            set('nameUz')(e.target.value);
          }}
        />
      </Field>
      <Field id={`${id}-name-ru`} label={t('storeNameRu')}>
        <Input
          id={`${id}-name-ru`}
          required
          maxLength={80}
          value={form.nameRu}
          onChange={(e) => {
            set('nameRu')(e.target.value);
          }}
        />
      </Field>
      <Field
        id={`${id}-slug`}
        label={t('slug')}
        hint={t('slugHint', { slug: form.slug || 'my-store' })}
        className="sm:col-span-2"
      >
        <Input
          id={`${id}-slug`}
          required
          autoCapitalize="none"
          spellCheck={false}
          maxLength={60}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          aria-describedby={`${id}-slug-hint`}
          value={form.slug}
          onChange={(e) => {
            set('slug')(e.target.value.toLowerCase());
          }}
        />
      </Field>
      <DistrictPicker
        regions={regions}
        regionId={geo.regionId}
        districtId={geo.districtId}
        onChange={setGeo}
      />
      <Field id={`${id}-legal-type`} label={t('legalType')}>
        <NativeSelect
          id={`${id}-legal-type`}
          value={form.legalType}
          onChange={(e) => {
            set('legalType')(e.target.value);
          }}
        >
          {LEGAL_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`legal_${type}`)}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id={`${id}-legal-name`} label={t('legalName')}>
        <Input
          id={`${id}-legal-name`}
          required
          maxLength={160}
          value={form.legalName}
          onChange={(e) => {
            set('legalName')(e.target.value);
          }}
        />
      </Field>
      <Field id={`${id}-tax`} label={t('taxId')} hint={t('taxIdHint')}>
        <Input
          id={`${id}-tax`}
          required
          inputMode="numeric"
          maxLength={9}
          pattern="\d{9}"
          aria-describedby={`${id}-tax-hint`}
          value={form.taxId}
          onChange={(e) => {
            set('taxId')(e.target.value.replace(/\D/g, ''));
          }}
        />
      </Field>
      <Field id={`${id}-phone`} label={t('contactPhone')}>
        <Input
          id={`${id}-phone`}
          required
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          maxLength={20}
          value={form.contactPhone}
          onChange={(e) => {
            set('contactPhone')(e.target.value);
          }}
        />
      </Field>
      <div className="flex flex-col gap-3 sm:col-span-2">
        <FormError id={`${id}-error`} message={error} />
        <p className="text-sm text-muted-foreground">{t('applyHint')}</p>
        <Button type="submit" disabled={pending} className="w-fit">
          {t('submitApplication')}
        </Button>
      </div>
    </form>
  );
}
