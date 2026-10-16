import { geocodeResponseSchema, reverseGeocodeResponseSchema } from '@uzgo/contracts';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppText, Button, Field } from '@/components/ui';
import { type FoodPoint, type PointSlot, setPoint, usePoint } from '@/lib/food-point';
import { currentPoint } from '@/lib/location';
import { spacing, useColors } from '@/lib/theme';
import { useApp } from '@/state/app';

/** A place: phone location first, or an address found on OpenStreetMap. */
export function FoodPointPicker({
  slot = 'food',
  hint,
  locateLabel,
  testID = 'food-point',
}: {
  slot?: PointSlot;
  hint?: string;
  locateLabel?: string;
  testID?: string;
}) {
  const { api, t, locale } = useApp();
  const c = useColors();
  const point = usePoint(slot);
  const setFoodPoint = (p: FoodPoint | null) => {
    setPoint(slot, p);
  };
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodPoint[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function locate() {
    setPending(true);
    setError(null);
    const here = await currentPoint();
    if (!here) {
      setError(t('foodLocationDenied'));
      setPending(false);
      return;
    }
    let label = t('foodMyLocation');
    try {
      const res = await api.request(
        `/food/reverse?lat=${String(here.lat)}&lng=${String(here.lng)}&locale=${locale}`,
        { schema: reverseGeocodeResponseSchema },
      );
      if (res.label) label = res.label;
    } catch {
      // Coordinates are enough.
    }
    setFoodPoint({ ...here, label });
    setPending(false);
  }

  async function search() {
    if (query.trim().length < 3) return;
    setPending(true);
    setError(null);
    try {
      const res = await api.request(
        `/food/geocode?q=${encodeURIComponent(query.trim())}&locale=${locale}`,
        { schema: geocodeResponseSchema },
      );
      setResults(res.items);
      if (res.items.length === 0) setError(t('foodAddressNotFound'));
    } catch {
      setError(t('foodAddressNotFound'));
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant={point ? 'body' : 'muted'} testID={testID}>
        {point ? point.label : (hint ?? t('foodPointHint'))}
      </AppText>
      <Button
        title={locateLabel ?? t('foodUseLocation')}
        icon="locate-outline"
        variant="outline"
        loading={pending}
        onPress={() => void locate()}
      />
      <Field
        label={t('foodSearchAddress')}
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() => void search()}
        maxLength={200}
        error={error}
      />
      <Button
        title={t('foodFind')}
        variant="secondary"
        disabled={query.trim().length < 3 || pending}
        onPress={() => void search()}
      />
      {results.map((r) => (
        <Pressable
          key={`${String(r.lat)},${String(r.lng)}`}
          accessibilityRole="button"
          onPress={() => {
            setFoodPoint(r);
            setResults([]);
            setQuery('');
          }}
          style={{ padding: spacing.sm, borderRadius: 8, backgroundColor: c.muted }}
        >
          <AppText variant="small" color="foreground">
            {r.label}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}
