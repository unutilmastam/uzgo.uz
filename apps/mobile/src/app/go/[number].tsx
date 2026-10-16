import { rideViewSchema } from '@uzgo/contracts';
import { formatPrice } from '@uzgo/ui/lib/money';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { z } from 'zod';
import { AppText, Badge, Button, Card, ErrorState, Loading, Row, Screen } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { confirmAction, notify } from '@/lib/dialogs';
import { formatPhone } from '@/lib/format';
import { payOrder } from '@/lib/payments';
import { spacing } from '@/lib/theme';
import { useRequest } from '@/lib/use-request';
import { useApp } from '@/state/app';

const LIVE = new Set(['AWAITING_PAYMENT', 'SEARCHING', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS']);
const rideResponse = z.object({ ride: rideViewSchema });

/** OpenStreetMap link (no embedded map tiles: ADR 0024/0025). */
const mapUrl = (lat: number, lng: number) =>
  `https://www.openstreetmap.org/?mlat=${lat.toFixed(5)}&mlon=${lng.toFixed(5)}#map=17/${lat.toFixed(5)}/${lng.toFixed(5)}`;

/** One ride, live: status, driver, car and plate, pay or cancel (refreshes every 5 s). */
export default function RideScreen() {
  const { number } = useLocalSearchParams<{ number: string }>();
  const { api, t, locale, errorText } = useApp();
  const ride = useRequest(
    () => api.request(`/rides/${encodeURIComponent(number)}`, { schema: rideResponse }),
    [number],
  );
  const [busy, setBusy] = useState(false);
  const live = ride.data ? LIVE.has(ride.data.ride.status) : false;
  const reload = ride.reload;

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(reload, 5_000);
    return () => {
      clearInterval(timer);
    };
  }, [live, reload]);

  if (ride.error && !ride.data) return <ErrorState error={ride.error} onRetry={reload} />;
  if (!ride.data) return <Loading />;
  const r = ride.data.ride;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      notify(err instanceof ApiError ? errorText(err) : t('error_generic'));
    } finally {
      setBusy(false);
      reload();
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: r.number }} />
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
          <AppText variant="title" accessibilityRole="header" testID="ride-status">
            {t(`rideStatus_${r.status}`)}
          </AppText>
          <Badge label={t(`rideClass_${r.rideClass}`)} tone="muted" />
        </View>
        <AppText variant="small">{t(`rideHint_${r.status}`)}</AppText>
        <Row label={t('goFrom')} value={r.pickup.label} />
        <Row label={t('goTo')} value={r.dropoff.label} />
      </Card>

      {r.driver ? (
        <Card>
          <AppText variant="heading">{t('goDriverIs', { name: r.driver.name })}</AppText>
          <AppText>{`${r.driver.car.color} ${r.driver.car.make} ${r.driver.car.model}`}</AppText>
          <AppText variant="title" testID="ride-plate">
            {r.driver.car.plate}
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
            {r.driver.phone ? (
              <Button
                title={formatPhone(r.driver.phone)}
                variant="outline"
                icon="call-outline"
                onPress={() => void Linking.openURL(`tel:${r.driver?.phone ?? ''}`)}
              />
            ) : null}
            {r.driver.position ? (
              <Button
                title={t('goDriverOnMap')}
                variant="outline"
                icon="map-outline"
                onPress={() =>
                  void Linking.openURL(
                    mapUrl(r.driver?.position?.lat ?? 0, r.driver?.position?.lng ?? 0),
                  )
                }
              />
            ) : null}
          </View>
        </Card>
      ) : null}

      <Card>
        <Row label={t('goPrice')} value={formatPrice(r.priceTiyin, locale)} strong />
        <Row
          label={t('paymentTitle')}
          value={`${t(`method_${r.paymentMethod}`)}${r.paid ? ` · ${t('goPaid')}` : ''}`}
        />
        <Row
          label={t('goTrip')}
          value={t('goTripInfo', { km: (r.distanceM / 1000).toFixed(1), minutes: r.etaMinutes })}
        />
        {r.refund ? (
          <AppText>
            {t(r.refund.status === 'SUCCEEDED' ? 'goRefunded' : 'goRefundPending', {
              amount: formatPrice(r.refund.amountTiyin, locale),
            })}
          </AppText>
        ) : null}
        {r.awaitingPayment ? (
          <Button
            title={t('payNow')}
            loading={busy}
            onPress={() => void run(() => payOrder(api, r.number, r.paymentMethod, locale))}
          />
        ) : null}
        {r.canCancel ? (
          <Button
            title={t('goCancel')}
            variant="outline"
            loading={busy}
            onPress={() =>
              void confirmAction(t('goCancelConfirm'), t('goCancel'), t('back'), true).then(
                (ok) => {
                  if (ok)
                    void run(() =>
                      api.request(`/rides/${encodeURIComponent(r.number)}/cancel`, {
                        method: 'POST',
                        body: {},
                      }),
                    );
                },
              )
            }
          />
        ) : null}
      </Card>
    </Screen>
  );
}
