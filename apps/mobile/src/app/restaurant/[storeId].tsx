import {
  adminRestaurantSchema,
  type RestaurantOrder,
  restaurantOrderListSchema,
  type SellerOrderStatus,
} from '@uzgo/contracts';
import { formatPrice } from '@uzgo/ui/lib/money';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { z } from 'zod';
import { AppText, Badge, Button, Card, ErrorState, Loading, Row, Screen } from '@/components/ui';
import { confirmAction, notify } from '@/lib/dialogs';
import { formatDateTime, formatPhone, localized } from '@/lib/format';
import { spacing } from '@/lib/theme';
import { useRequest } from '@/lib/use-request';
import { useApp } from '@/state/app';

const NEGATIVE = new Set<SellerOrderStatus>(['CANCELLED_BY_SELLER', 'DELIVERY_FAILED']);

function Ticket({ order, onChanged }: { order: RestaurantOrder; onChanged: () => void }) {
  const { api, t, locale, errorText } = useApp();
  const [busy, setBusy] = useState(false);
  async function move(to: SellerOrderStatus) {
    const label = t(`kitchenAction_${to}`);
    if (NEGATIVE.has(to)) {
      const ok = await confirmAction(
        t('actionConfirm', { action: label }),
        label,
        t('cancel'),
        true,
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      await api.request(`/seller/seller-orders/${order.id}/transition`, {
        method: 'POST',
        body: { to },
      });
      onChanged();
    } catch (err) {
      notify(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
        <AppText variant="heading">{order.orderNumber}</AppText>
        <Badge
          label={t(`courierStatus_${order.status}`)}
          tone={order.status === 'NEW' ? 'sale' : 'secondary'}
        />
      </View>
      <AppText variant="small">
        {order.acceptBy
          ? t('kitchenAcceptBy', { time: formatDateTime(order.acceptBy, locale) })
          : formatDateTime(order.createdAt, locale)}
      </AppText>
      {order.items.map((item, i) => (
        <Row
          key={`${item.name.uz}-${String(i)}`}
          label={`${localized(item.name, locale)} × ${String(item.quantity)}`}
          value={formatPrice(item.lineTotalTiyin, locale)}
        />
      ))}
      {order.collectTiyin ? (
        <Row label={t('kitchenCollect')} value={formatPrice(order.collectTiyin, locale)} strong />
      ) : null}
      <AppText variant="small">{t(`foodMode_${order.deliveryMode}`)}</AppText>
      {order.deliveryMode === 'SELF' ? (
        <View style={{ gap: 2 }}>
          <AppText>{`${order.recipientName}, ${formatPhone(order.recipientPhone)}`}</AppText>
          <AppText variant="muted">{order.addressLine}</AppText>
          <Button
            title={t('callRecipient')}
            variant="outline"
            icon="call-outline"
            onPress={() => void Linking.openURL(`tel:${order.recipientPhone}`)}
          />
        </View>
      ) : order.courier ? (
        <AppText>{t('kitchenCourier', { phone: formatPhone(order.courier.phone) })}</AppText>
      ) : null}
      {order.comment ? <AppText variant="small">{order.comment}</AppText> : null}
      {order.allowedTransitions.map((to) => (
        <Button
          key={to}
          title={t(`kitchenAction_${to}`)}
          variant={NEGATIVE.has(to) ? 'outline' : 'primary'}
          loading={busy}
          onPress={() => void move(to)}
        />
      ))}
    </Card>
  );
}

/** Restaurant team in the app: live orders and pausing intake (ADR 0024). */
export default function RestaurantOrdersScreen() {
  const { storeId } = useLocalSearchParams<{ storeId: string }>();
  const { api, t, locale, errorText } = useApp();
  const info = useRequest(
    () =>
      api.request(`/restaurant/${encodeURIComponent(storeId)}`, {
        schema: z.object({ restaurant: adminRestaurantSchema }),
      }),
    [storeId],
  );
  const orders = useRequest(
    () =>
      api.request(`/restaurant/${encodeURIComponent(storeId)}/orders?scope=active`, {
        schema: restaurantOrderListSchema,
      }),
    [storeId],
  );
  const reloadOrders = orders.reload;
  useEffect(() => {
    const timer = setInterval(reloadOrders, 20_000);
    return () => {
      clearInterval(timer);
    };
  }, [reloadOrders]);

  if (info.error && !info.data) return <ErrorState error={info.error} onRetry={info.reload} />;
  if (!info.data || !orders.data) return <Loading />;
  const restaurant = info.data.restaurant;

  async function togglePause() {
    try {
      await api.request(`/restaurant/${encodeURIComponent(storeId)}/settings`, {
        method: 'PATCH',
        body: { acceptingOrders: !restaurant.acceptingOrders },
      });
      info.reload();
    } catch (err) {
      notify(errorText(err));
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: localized(restaurant.name, locale) }} />
      <Card>
        <AppText>{restaurant.acceptingOrders ? t('kitchenAccepting') : t('kitchenPaused')}</AppText>
        <Button
          title={restaurant.acceptingOrders ? t('kitchenPause') : t('kitchenResume')}
          variant={restaurant.acceptingOrders ? 'outline' : 'primary'}
          onPress={() => void togglePause()}
        />
      </Card>
      {orders.data.items.length === 0 ? (
        <AppText variant="muted">{t('kitchenNoOrders')}</AppText>
      ) : (
        orders.data.items.map((o) => <Ticket key={o.id} order={o} onChanged={orders.reload} />)
      )}
    </Screen>
  );
}
