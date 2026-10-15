import { orderResponseSchema, type SellerOrderView } from '@uzgo/contracts';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, View } from 'react-native';
import {
  AppText,
  Badge,
  Button,
  Card,
  Divider,
  ErrorState,
  Loading,
  Price,
  Row,
  Screen,
} from '@/components/ui';
import { confirmAction, notify } from '@/lib/dialogs';
import { formatDateTime, formatPhone, localized } from '@/lib/format';
import { isOnlineMethod, payOrder } from '@/lib/payments';
import { spacing } from '@/lib/theme';
import { useRequest } from '@/lib/use-request';
import { useApp } from '@/state/app';

/** Customer actions the server allows on a shipment (cancel while NEW, request a return). */
const CUSTOMER_ACTIONS = ['CANCELLED_BY_CUSTOMER', 'RETURN_REQUESTED'] as const;

function Shipment({
  shipment,
  orderNumber,
  onChanged,
}: {
  shipment: SellerOrderView;
  orderNumber: string;
  onChanged: () => void;
}) {
  const { api, t, locale, errorText } = useApp();
  const [pending, setPending] = useState(false);
  const actions = CUSTOMER_ACTIONS.filter((a) => shipment.allowedTransitions.includes(a));

  async function run(to: (typeof CUSTOMER_ACTIONS)[number]) {
    const label = t(`customerAction_${to}`);
    const ok = await confirmAction(
      t('actionConfirm', { action: label }),
      label,
      t('cancel'),
      to === 'CANCELLED_BY_CUSTOMER',
    );
    if (!ok) return;
    setPending(true);
    try {
      await api.request(`/orders/${orderNumber}/seller-orders/${shipment.id}/transition`, {
        method: 'POST',
        body: { to },
      });
      onChanged();
    } catch (err) {
      notify(errorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <View style={{ gap: 2 }}>
        <AppText variant="heading">{t('shipmentNumber', { number: shipment.number })}</AppText>
        <AppText variant="small">
          {t('fromStore', { store: localized(shipment.store.name, locale) })}
        </AppText>
      </View>
      <Badge
        label={t(`ss_${shipment.status}`)}
        tone={shipment.status === 'DELIVERED' ? 'accent' : 'secondary'}
      />
      {shipment.items.map((item) => (
        <Row
          key={`${item.sku}-${item.productSlug}`}
          label={`${localized(item.title, locale)} × ${String(item.quantity)}`}
          value={<Price value={item.lineTotalTiyin} />}
        />
      ))}
      {shipment.tracking ? (
        <AppText style={{ fontWeight: '600' }}>
          {t('tracking', { carrier: shipment.tracking.carrier, code: shipment.tracking.code })}
        </AppText>
      ) : null}
      {shipment.timeline.length > 1 ? (
        <View style={{ gap: spacing.xs }}>
          <AppText variant="small" color="foreground" style={{ fontWeight: '600' }}>
            {t('timeline')}
          </AppText>
          {shipment.timeline.map((step) => (
            <Row
              key={`${step.status}-${step.at}`}
              label={t(`ss_${step.status}`)}
              value={<AppText variant="small">{formatDateTime(step.at, locale)}</AppText>}
            />
          ))}
        </View>
      ) : null}
      {actions.map((to) => (
        <Button
          key={to}
          title={t(`customerAction_${to}`)}
          variant="outline"
          loading={pending}
          onPress={() => void run(to)}
        />
      ))}
    </Card>
  );
}

export default function OrderScreen() {
  const { number, placed } = useLocalSearchParams<{ number: string; placed?: string }>();
  const { api, t, locale, errorText } = useApp();
  const [paying, setPaying] = useState(false);
  const result = useRequest(
    () => api.request(`/orders/${encodeURIComponent(number)}`, { schema: orderResponseSchema }),
    [number],
  );
  const order = result.data?.order;
  if (result.error && !order) return <ErrorState error={result.error} onRetry={result.reload} />;
  if (!order) return <Loading />;

  const unpaid = order.payment.status === 'UNPAID';

  async function pay() {
    if (!order) return;
    setPaying(true);
    try {
      await payOrder(api, order.number, order.paymentMethod, locale);
    } catch (err) {
      notify(errorText(err));
    } finally {
      setPaying(false);
      result.reload();
    }
  }

  async function cancelOrder() {
    const ok = await confirmAction(t('cancelOrderConfirm'), t('cancelOrder'), t('cancel'), true);
    if (!ok) return;
    try {
      await api.request(`/orders/${encodeURIComponent(number)}/cancel`, { method: 'POST' });
      result.reload();
    } catch (err) {
      notify(errorText(err));
    }
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={false} onRefresh={result.reload} />}>
      <Stack.Screen options={{ title: t('orderNumber', { number: order.number }) }} />
      {placed === '1' ? (
        <Card>
          <AppText variant="heading" color="success">
            {t('orderPlaced')}
          </AppText>
        </Card>
      ) : null}
      <Card>
        <Row label={t('paymentStatus')} value={t(`pay_${order.payment.status}`)} />
        <AppText variant="small">{t(`method_${order.paymentMethod}`)}</AppText>
        {unpaid && order.payment.dueAt ? (
          <AppText variant="small" color="warning">
            {t('payBefore', { time: formatDateTime(order.payment.dueAt, locale) })}
          </AppText>
        ) : null}
        {unpaid && isOnlineMethod(order.paymentMethod) ? (
          <View style={{ gap: spacing.sm }}>
            <Button title={t('payNow')} loading={paying} onPress={() => void pay()} />
            <Button title={t('cancelOrder')} variant="outline" onPress={() => void cancelOrder()} />
          </View>
        ) : null}
        <Divider />
        <Row label={t('itemsLine')} value={<Price value={order.itemsTotalTiyin} />} />
        <Row label={t('deliveryLine')} value={<Price value={order.deliveryTotalTiyin} />} />
        <Row label={t('total')} value={<Price value={order.totalTiyin} />} strong />
      </Card>
      {order.sellerOrders.map((shipment) => (
        <Shipment
          key={shipment.id}
          shipment={shipment}
          orderNumber={order.number}
          onChanged={result.reload}
        />
      ))}
      <Card>
        <AppText variant="heading">{t('deliveryAddress')}</AppText>
        <AppText>{t(`dt_${order.deliveryType}`)}</AppText>
        <AppText>{`${order.address.recipientName}, ${formatPhone(order.address.recipientPhone)}`}</AppText>
        {order.pickupPoint ? (
          <AppText variant="muted">
            {`${localized(order.pickupPoint.name, locale)} — ${order.pickupPoint.address}`}
          </AppText>
        ) : (
          <AppText variant="muted">
            {[
              localized(order.address.region, locale),
              localized(order.address.district, locale),
              order.address.line,
            ].join(', ')}
          </AppText>
        )}
      </Card>
    </Screen>
  );
}
