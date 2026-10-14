'use client';

import { type District, districtsResponseSchema, type Region } from '@uzgo/contracts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@uzgo/ui/components/select';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
import type { Locale } from '@/i18n/routing';
import { apiClient } from '@/lib/api-client';

/** Region → district selects (districts load from the API when the region changes). */
export function DistrictPicker({
  regions,
  regionId,
  districtId,
  onChange,
}: {
  regions: Region[];
  regionId: string;
  districtId: string;
  onChange: (value: { regionId: string; districtId: string }) => void;
}) {
  const t = useTranslations('account');
  const locale = useLocale() as Locale;
  const regionLabel = useId();
  const districtLabel = useId();
  const [districts, setDistricts] = useState<District[]>([]);

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

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label id={regionLabel} className="text-sm font-medium">
          {t('region')}
        </label>
        <Select
          value={regionId}
          onValueChange={(value) => {
            onChange({ regionId: value, districtId: '' });
          }}
        >
          <SelectTrigger aria-labelledby={regionLabel}>
            <SelectValue placeholder={t('selectRegion')} />
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
        <label id={districtLabel} className="text-sm font-medium">
          {t('district')}
        </label>
        <Select
          value={districtId}
          onValueChange={(value) => {
            onChange({ regionId, districtId: value });
          }}
          disabled={!regionId || districts.length === 0}
        >
          <SelectTrigger aria-labelledby={districtLabel}>
            <SelectValue placeholder={t('selectDistrict')} />
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
    </>
  );
}
