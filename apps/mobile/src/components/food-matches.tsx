import { searchAllSchema } from '@uzgo/contracts';
import { formatPrice } from '@uzgo/ui/lib/money';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { AppText, Button } from '@/components/ui';
import { localized } from '@/lib/format';
import { radius, spacing, useColors } from '@/lib/theme';
import { useRequest } from '@/lib/use-request';
import { useApp } from '@/state/app';

/** UZGO Food matches above product results, and a way to ask the assistant (ADR 0026). */
export function FoodMatches({ query }: { query: string }) {
  const { api, t, locale } = useApp();
  const c = useColors();
  const found = useRequest(
    () => api.request(`/search/all?q=${encodeURIComponent(query)}`, { schema: searchAllSchema }),
    [query],
  );
  const restaurants = found.data?.restaurants ?? [];
  const dishes = found.data?.dishes ?? [];
  const chip = {
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    gap: 2,
  };
  return (
    <View style={{ gap: spacing.sm, paddingBottom: spacing.sm }}>
      {restaurants.length > 0 || dishes.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <AppText variant="heading">{t('searchFood')}</AppText>
          {restaurants.map((r) => (
            <Pressable
              key={r.id}
              accessibilityRole="link"
              style={chip}
              testID="search-restaurant"
              onPress={() => {
                router.push({ pathname: '/food/[slug]', params: { slug: r.slug } });
              }}
            >
              <AppText style={{ fontWeight: '600' }}>{localized(r.name, locale)}</AppText>
              <AppText variant="small">{r.address}</AppText>
            </Pressable>
          ))}
          {dishes.map((d) => (
            <Pressable
              key={d.id}
              accessibilityRole="link"
              style={chip}
              testID="search-dish"
              onPress={() => {
                router.push({ pathname: '/food/[slug]', params: { slug: d.restaurant.slug } });
              }}
            >
              <AppText style={{ fontWeight: '600' }}>{localized(d.name, locale)}</AppText>
              <AppText variant="small">
                {`${localized(d.restaurant.name, locale)} · ${formatPrice(d.priceTiyin, locale)}`}
              </AppText>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Button
        title={t('askAssistant')}
        variant="ghost"
        icon="sparkles-outline"
        onPress={() => {
          router.push({ pathname: '/assistant', params: { q: query } });
        }}
      />
    </View>
  );
}
