import Ionicons from '@expo/vector-icons/Ionicons';
import { restaurantListSchema } from '@uzgo/contracts';
import { formatPrice } from '@uzgo/ui/lib/money';
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { FoodPointPicker } from '@/components/food-point-picker';
import { AppText, Badge, Card, EmptyState, ErrorState, Loading, Screen } from '@/components/ui';
import { mediaUrl } from '@/lib/config';
import { useFoodPoint } from '@/lib/food-point';
import { localized } from '@/lib/format';
import { radius, spacing, useColors } from '@/lib/theme';
import { useRequest } from '@/lib/use-request';
import { useApp } from '@/state/app';

/** UZGO Food: restaurants, nearest first once a delivery point is chosen. */
export default function FoodScreen() {
  const { api, t, locale } = useApp();
  const c = useColors();
  const point = useFoodPoint();
  const list = useRequest(
    () =>
      api.request(
        point
          ? `/food/restaurants?lat=${String(point.lat)}&lng=${String(point.lng)}`
          : '/food/restaurants',
        { schema: restaurantListSchema },
      ),
    [point?.lat, point?.lng],
  );

  return (
    <Screen>
      <Stack.Screen options={{ title: t('foodTitle') }} />
      <Card>
        <AppText variant="heading">{t('foodDeliverTo')}</AppText>
        <FoodPointPicker />
      </Card>
      {list.error && !list.data ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <Loading />
      ) : list.data.items.length === 0 ? (
        <EmptyState icon="restaurant-outline" title={t('foodNoRestaurants')} />
      ) : (
        list.data.items.map((r) => (
          <Pressable
            key={r.id}
            accessibilityRole="link"
            accessibilityLabel={localized(r.name, locale)}
            testID="restaurant-card"
            onPress={() => {
              router.push({ pathname: '/food/[slug]', params: { slug: r.slug } });
            }}
            style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
          >
            <View style={[styles.cover, { backgroundColor: c.muted }]}>
              {r.cover ? (
                <Image
                  source={mediaUrl(r.cover)}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
              ) : (
                <Ionicons name="restaurant-outline" size={36} color={c.mutedForeground} />
              )}
            </View>
            <View style={{ padding: spacing.md, gap: 4 }}>
              <AppText variant="heading">{localized(r.name, locale)}</AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                <Badge
                  label={r.openNow ? t('foodOpen') : t('foodClosed')}
                  tone={r.openNow ? 'accent' : 'muted'}
                />
                {r.deliversHere === false ? <Badge label={t('foodNotHere')} tone="muted" /> : null}
              </View>
              <AppText variant="small">
                {[
                  r.etaMinutes !== null ? t('foodEta', { minutes: r.etaMinutes }) : null,
                  r.deliveryFeeTiyin !== null
                    ? r.deliveryFeeTiyin === '0'
                      ? t('foodFreeDelivery')
                      : formatPrice(r.deliveryFeeTiyin, locale)
                    : null,
                  t(`foodMode_${r.deliveryMode}`),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </AppText>
            </View>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  cover: { aspectRatio: 16 / 7, alignItems: 'center', justifyContent: 'center' },
});
