import Ionicons from '@expo/vector-icons/Ionicons';
import { orderListResponseSchema } from '@uzgo/contracts';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import {
  AppText,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Loading,
  Price,
  Screen,
  styles as ui,
} from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { spacing, useColors } from '@/lib/theme';
import { useRequest } from '@/lib/use-request';
import { useApp } from '@/state/app';

function OrdersList() {
  const { api, t, locale } = useApp();
  const c = useColors();
  const orders = useRequest(() => api.request('/orders', { schema: orderListResponseSchema }), []);
  useFocusEffect(
    useCallback(() => {
      orders.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- reload is stable
    }, []),
  );
  if (orders.error && !orders.data)
    return <ErrorState error={orders.error} onRetry={orders.reload} />;
  if (!orders.data) return <Loading />;
  return (
    <FlatList
      data={orders.data.items}
      keyExtractor={(o) => o.number}
      style={{ backgroundColor: c.background }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={orders.reload} />}
      ListEmptyComponent={<EmptyState icon="receipt-outline" title={t('noOrders')} />}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => {
            router.push({ pathname: '/order/[number]', params: { number: item.number } });
          }}
          accessibilityRole="link"
        >
          <Card>
            <View style={ui.between}>
              <AppText variant="heading">{t('orderNumber', { number: item.number })}</AppText>
              <Ionicons name="chevron-forward" size={18} color={c.mutedForeground} />
            </View>
            <AppText variant="small">{formatDateTime(item.createdAt, locale)}</AppText>
            <Badge label={t(`status_${item.status}`)} />
            <View style={ui.between}>
              <AppText variant="small">{t('itemCount', { count: item.itemCount })}</AppText>
              <Price value={item.totalTiyin} />
            </View>
          </Card>
        </Pressable>
      )}
    />
  );
}

export default function OrdersScreen() {
  const { user, t } = useApp();
  if (!user) {
    return (
      <Screen>
        <EmptyState
          icon="receipt-outline"
          title={t('loginToSeeOrders')}
          action={{
            title: t('login'),
            onPress: () => {
              router.push({ pathname: '/login', params: { next: '/orders' } });
            },
          }}
        />
      </Screen>
    );
  }
  return <OrdersList />;
}
