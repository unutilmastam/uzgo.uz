'use client';

import type { CurrentUser, District, Region } from '@uzgo/contracts';
import { districtsResponseSchema } from '@uzgo/contracts';
import { Button } from '@uzgo/ui/components/button';
import { Input } from '@uzgo/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@uzgo/ui/components/select';
import { toast } from '@uzgo/ui/components/toast';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { ApiClientError, apiClient } from '@/lib/api-client';

export function ProfileForm({ user, regions }: { user: CurrentUser; regions: Region[] }) {
  const t = useTranslations();
  const locale = useLocale() as 'uz' | 'ru';
  const router = useRouter();
  const ids = { first: useId(), last: useId(), region: useId(), district: useId(), error: useId() };

  const [firstName, setFirstName] = useState(user.profile.firstName ?? '');
  const [lastName, setLastName] = useState(user.profile.lastName ?? '');
  const [regionId, setRegionId] = useState(user.profile.regionId ?? '');
  const [districtId, setDistrictId] = useState(user.profile.districtId ?? '');
  const [districts, setDistricts] = useState<District[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!regionId) return;
    let cancelled = false;
    void apiClient(`/geo/regions/${regionId}/districts`)
      .then((json) => {
        if (!cancelled) setDistricts(districtsResponseSchema.parse(json).items);
      })
      .catch(() => {
        if (!cancelled) setDistricts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [regionId]);

  async function save() {
    setPending(true);
    setError(null);
    try {
      await apiClient('/users/me', {
        method: 'PATCH',
        body: {
          firstName: firstName.trim() || null,
          lastName: lastName.trim() || null,
          districtId: districtId || null,
        },
      });
      toast.success(t('account.saved'));
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiClientError && err.code === 'VALIDATION_FAILED'
          ? t('account.invalidName')
          : t('auth.error_generic'),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="grid gap-4 sm:grid-cols-2"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.first} className="text-sm font-medium">
          {t('account.firstName')}
        </label>
        <Input
          id={ids.first}
          autoComplete="given-name"
          maxLength={60}
          value={firstName}
          onChange={(e) => {
            setFirstName(e.target.value);
          }}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.last} className="text-sm font-medium">
          {t('account.lastName')}
        </label>
        <Input
          id={ids.last}
          autoComplete="family-name"
          maxLength={60}
          value={lastName}
          onChange={(e) => {
            setLastName(e.target.value);
          }}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label id={ids.region} className="text-sm font-medium">
          {t('account.region')}
        </label>
        <Select
          value={regionId}
          onValueChange={(value) => {
            setRegionId(value);
            setDistrictId('');
          }}
        >
          <SelectTrigger aria-labelledby={ids.region}>
            <SelectValue placeholder={t('account.selectRegion')} />
          </SelectTrigger>
          <SelectContent>
            {regions.map((region) => (
              <SelectItem key={region.id} value={region.id}>
                {region.name[locale]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label id={ids.district} className="text-sm font-medium">
          {t('account.district')}
        </label>
        <Select
          value={districtId}
          onValueChange={setDistrictId}
          disabled={!regionId || districts.length === 0}
        >
          <SelectTrigger aria-labelledby={ids.district}>
            <SelectValue placeholder={t('account.selectDistrict')} />
          </SelectTrigger>
          <SelectContent>
            {districts.map((district) => (
              <SelectItem key={district.id} value={district.id}>
                {district.name[locale]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {error ? (
        <p
          id={ids.error}
          role="alert"
          className="text-sm font-medium text-destructive sm:col-span-2"
        >
          {error}
        </p>
      ) : null}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {t('account.save')}
        </Button>
      </div>
    </form>
  );
}
