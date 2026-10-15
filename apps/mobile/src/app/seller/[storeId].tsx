import { sellerShipmentListSchema, type SellerOrderStatus } from '@uzgo/contracts';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, RefreshControl, View } from 'react-native';
import type { z } from 'zod';
import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Loading,
  Price,
  Row,
  Screen,
  styles as ui,
} from '@/components/ui';
import { ReturnInfo } from '@/components/return-info';
import { confirmAction, notify } from '@/lib/dialogs';
import { formatDateTime, formatPhone, localized } from '@/lib/format';
import { spacing } from '@/lib/theme';
import { useRequest } from '@/lib/use-request';
import { useApp } from '@/state/app';

type Shipment = z.infer<typeof sellerShipmentListSchema>['items'][number];

const DONE: SellerOrderStatus[] = [
  'DELIVERED',
  'CANCELLED_BY_SELLER',
  'CANCELLED_BY_CUSTOMER',
  'RETURNED',
  'RETURN_REJECTED',
];
const TRACKABLE: SellerOrderStatus[] = ['ACCEPTED', 'PACKED', 'HANDED_TO_DELIVERY'];
const NEGATIVE = new Set<SellerOrderStatus>([
  'CANCELLED_BY_SELLER',
  'DELIVERY_FAILED',
  'RETURN_REJECTED',
]);

function ShipmentCard({ shipment, onChanged }: { shipment: Shipment; onChanged: () => void }) {
  const { api, t, locale, errorText } = useApp();
  const [pending, setPending] = useState(false);
  const [carrier, setCarrier] = useState(shipment.tracking?.carrier ?? '');
  const [code, setCode] = useState(shipment.tracking?.code ?? '');
  const [note, setNote] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [decision, setDecision] = useState('');

  function transition(to: SellerOrderStatus, reason?: string) {
    if (to === 'RETURN_REJECTED' && reason === undefined) {
      setRejecting(true);
      return;
    }
    const label = t(`sellerAction_${to}`);
    const go = () => {
      setPending(true);
      api
        .request(`/seller/seller-orders/${shipment.id}/transition`, {
          method: 'POST',
          body: { to, ...(reason ? { reason } : {}) },
        })
        .then(
          () => {
            setRejecting(false);
            onChanged();
          },
          (err: unknown) => {
            notify(errorText(err));
          },
        )
        .finally(() => {
          setPending(false);
        });
    };
    // Irreversible or negative steps are confirmed first.
    if ((NEGATIVE.has(to) || to === 'DELIVERED') && reason === undefined) {
      void confirmAction(
        t('actionConfirm', { action: label }),
        label,
        t('cancel'),
        NEGATIVE.has(to),
      ).then((ok) => {
        if (ok) go();
      });
    } else go();
  }

  async function saveTracking() {
    setPending(true);
    setNote(null);
    try {
      await api.request(`/seller/seller-orders/${shipment.id}/tracking`, {
        method: 'PATCH',
        body: { carrier: carrier.trim(), trackingCode: code.trim() },
      });
      setNote(t('saved'));
      onChanged();
    } catch (err) {
      setNote(errorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <View style={ui.between}>
        <AppText variant="heading">{t('shipmentNumber', { number: shipment.number })}</AppText>
        <Badge
          label={t(`ss_${shipment.status}`)}
          tone={DONE.includes(shipment.status) ? 'muted' : 'secondary'}
        />
      </View>
      <AppText variant="small">{formatDateTime(shipment.createdAt, locale)}</AppText>
      {shipment.items.map((item) => (
        <Row
          key={`${item.sku}-${item.productSlug}`}
          label={`${localized(item.title, locale)} × ${String(item.quantity)}`}
          value={<Price value={item.lineTotalTiyin} />}
        />
      ))}
      <Row label={t('total')} value={<Price value={shipment.totalTiyin} />} strong />
      <View style={{ gap: 2 }}>
        <AppText variant="small" color="foreground" style={{ fontWeight: '600' }}>
          {t('recipient')}
        </AppText>
        <AppText>{`${shipment.recipientName}, ${formatPhone(shipment.recipientPhone)}`}</AppText>
        <AppText variant="muted">
          {`${localized(shipment.district, locale)}, ${shipment.addressLine}`}
        </AppText>
      </View>
      <Button
        title={t('callRecipient')}
        variant="outline"
        icon="call-outline"
        onPress={() => void Linking.openURL(`tel:${shipment.recipientPhone}`)}
      />
      {TRACKABLE.includes(shipment.status) ? (
        <View style={{ gap: spacing.sm }}>
          <Field label={t('carrier')} value={carrier} onChangeText={setCarrier} maxLength={60} />
          <Field
            label={t('trackingCode')}
            value={code}
            onChangeText={setCode}
            maxLength={60}
            autoCapitalize="characters"
          />
          <Button
            title={t('saveTracking')}
            variant="secondary"
            loading={pending}
            disabled={carrier.trim().length < 2 || code.trim().length < 3}
            onPress={() => void saveTracking()}
          />
          {note ? <AppText variant="small">{note}</AppText> : null}
        </View>
      ) : null}
      <ReturnInfo shipment={shipment} />
      {rejecting ? (
        <View style={{ gap: spacing.sm }}>
          <Field
            label={t('returnRejectNote')}
            value={decision}
            onChangeText={setDecision}
            maxLength={300}
            multiline
          />
          <Button
            title={t('sellerAction_RETURN_REJECTED')}
            variant="destructive"
            loading={pending}
            disabled={decision.trim().length < 3}
            onPress={() => {
              transition('RETURN_REJECTED', decision.trim());
            }}
          />
          <Button
            title={t('cancel')}
            variant="ghost"
            onPress={() => {
              setRejecting(false);
            }}
          />
        </View>
      ) : null}
      {(rejecting ? [] : shipment.allowedTransitions).map((to) => (
        <Button
          key={to}
          title={t(`sellerAction_${to}`)}
          variant={NEGATIVE.has(to) ? 'outline' : 'primary'}
          loading={pending}
          onPress={() => {
            transition(to);
          }}
        />
      ))}
    </Card>
  );
}

export default function StoreShipmentsScreen() {
  const { storeId } = useLocalSearchParams<{ storeId: string }>();
  const { api, t } = useApp();
  const [activeOnly, setActiveOnly] = useState(true);
  const shipments = useRequest(
    () =>
      api.request(`/seller/orders?storeId=${encodeURIComponent(storeId)}`, {
        schema: sellerShipmentListSchema,
      }),
    [storeId],
  );
  if (shipments.error && !shipments.data) {
    return <ErrorState error={shipments.error} onRetry={shipments.reload} />;
  }
  if (!shipments.data) return <Loading />;
  const items = shipments.data.items.filter((s) => !activeOnly || !DONE.includes(s.status));
  return (
    <Screen refreshControl={<RefreshControl refreshing={false} onRefresh={shipments.reload} />}>
      <Stack.Screen options={{ title: t('storeShipments') }} />
      <View style={ui.row}>
        <Button
          title={t('filterActive')}
          variant={activeOnly ? 'primary' : 'outline'}
          onPress={() => {
            setActiveOnly(true);
          }}
        />
        <Button
          title={t('filterAll')}
          variant={activeOnly ? 'outline' : 'primary'}
          onPress={() => {
            setActiveOnly(false);
          }}
        />
      </View>
      {items.length === 0 ? (
        <EmptyState icon="cube-outline" title={t('noShipments')} />
      ) : (
        items.map((s) => <ShipmentCard key={s.id} shipment={s} onChanged={shipments.reload} />)
      )}
    </Screen>
  );
}
