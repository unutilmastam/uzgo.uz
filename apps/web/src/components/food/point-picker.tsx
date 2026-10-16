'use client';

import { geocodeResponseSchema, reverseGeocodeResponseSchema } from '@uzgo/contracts';
import { Button } from '@uzgo/ui/components/button';
import { Input } from '@uzgo/ui/components/input';
import { LocateFixed, MapPin } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { currentPosition, type SavedPoint, usePoint } from './use-point';

/**
 * Where to deliver: the phone/browser location (best) or an address found on
 * OpenStreetMap. The point decides fee, ETA and whether a restaurant delivers.
 */
export function PointPicker({
  compact = false,
  storageKey,
  hint,
  locateLabel,
  testId = 'point-picker',
}: {
  compact?: boolean;
  /** Where the point is kept in this browser (default: the food delivery point). */
  storageKey?: string;
  /** Shown while no point is chosen. */
  hint?: string;
  locateLabel?: string;
  testId?: string;
}) {
  const t = useTranslations('food');
  const locale = useLocale();
  const id = useId();
  const [point, setPoint] = usePoint(storageKey);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SavedPoint[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function locate() {
    setPending(true);
    setError(null);
    const here = await currentPosition();
    if (!here) {
      setError(t('locationDenied'));
      setPending(false);
      return;
    }
    let label = t('myLocation');
    try {
      const res = reverseGeocodeResponseSchema.parse(
        await apiClient(
          `/food/reverse?lat=${String(here.lat)}&lng=${String(here.lng)}&locale=${locale}`,
        ),
      );
      if (res.label) label = res.label;
    } catch {
      // The coordinates are enough.
    }
    setPoint({ ...here, label });
    setResults(null);
    setPending(false);
  }

  async function search() {
    if (query.trim().length < 3) return;
    setPending(true);
    setError(null);
    try {
      const res = geocodeResponseSchema.parse(
        await apiClient(`/food/geocode?q=${encodeURIComponent(query.trim())}&locale=${locale}`),
      );
      setResults(res.items);
      if (res.items.length === 0) setError(t('addressNotFound'));
    } catch {
      setError(t('addressNotFound'));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      {point ? (
        <p className="flex items-start gap-2 text-sm">
          <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          <span className="line-clamp-2" data-testid="point-label">
            {point.label}
          </span>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{hint ?? t('pointHint')}</p>
      )}
      <div className={compact ? 'flex flex-wrap gap-2' : 'flex flex-col gap-2 sm:flex-row'}>
        <Button type="button" variant="outline" disabled={pending} onClick={() => void locate()}>
          <LocateFixed aria-hidden="true" className="size-4" />
          {locateLabel ?? t('useMyLocation')}
        </Button>
        <form
          className="flex flex-1 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void search();
          }}
        >
          <label htmlFor={`${id}-q`} className="sr-only">
            {t('searchAddress')}
          </label>
          <Input
            id={`${id}-q`}
            value={query}
            placeholder={t('searchAddressPlaceholder')}
            maxLength={200}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
          <Button type="submit" variant="secondary" disabled={pending || query.trim().length < 3}>
            {t('find')}
          </Button>
        </form>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {results && results.length > 0 ? (
        <ul className="flex flex-col gap-1" aria-label={t('searchResults')}>
          {results.map((r) => (
            <li key={`${String(r.lat)},${String(r.lng)}`}>
              <button
                type="button"
                className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => {
                  setPoint(r);
                  setResults(null);
                  setQuery('');
                }}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
