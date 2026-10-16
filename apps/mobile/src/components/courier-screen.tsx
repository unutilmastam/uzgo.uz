import { type CourierJob, courierMeSchema, courierOffersSchema } from '@uzgo/contracts';
import { formatPrice } from '@uzgo/ui/lib/money';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { AppText, Badge, Button, Card, ErrorState, Loading, Row, Screen } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { confirmAction, notify } from '@/lib/dialogs';
import { localized } from '@/lib/format';
import { currentPoint } from '@/lib/location';
import { spacing } from '@/lib/theme';
import { useRequest } from '@/lib/use-request';
import { useApp } from '@/state/app';

/** OpenStreetMap link (no embedded map tiles: ADR 0024). */
const mapUrl = (lat: number, lng: number) =>
  `https://www.openstreetmap.org/?mlat=${lat.toFixed(5)}&mlon=${lng.toFixed(5)}#map=17/${lat.toFixed(5)}/${lng.toFixed(5)}`;

const km = (m: number) => (m / 1000).toFixed(1);

function JobCard({
  job,
  onAccept,
  onMove,
  busy,
}: {
  job: CourierJob;
  onAccept?: () => void;
  onMove?: (to: 'HANDED_TO_DELIVERY' | 'DELIVERED' | 'DELIVERY_FAILED') => void;
  busy: boolean;
}) {
  const { t, locale } = useApp();
  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
        <AppText variant="heading" style={{ flex: 1 }}>
          {localized(job.restaurant.name, locale)}
        </AppText>
        <Badge label={t(`courierStatus_${job.status}`)} />
      </View>
      <AppText variant="small">{job.restaurant.address}</AppText>
      <Row label={t('courierFee')} value={formatPrice(job.feeTiyin, locale)} strong />
      <Row
        label={t('courierRoute')}
        value={t('courierKm', {
          toRestaurant: job.toRestaurantM === null ? '—' : km(job.toRestaurantM),
          toCustomer: km(job.distanceM),
        })}
      />
      {job.collectTiyin ? (
        <Row label={t('courierCollect')} value={formatPrice(job.collectTiyin, locale)} />
      ) : (
        <AppText variant="small">{t('courierPaidOnline')}</AppText>
      )}
      {job.customer ? (
        <View style={{ gap: spacing.xs }}>
          <AppText style={{ fontWeight: '600' }}>{job.customer.name}</AppText>
          <AppText>{job.customer.addressLine}</AppText>
          {job.customer.comment ? <AppText variant="small">{job.customer.comment}</AppText> : null}
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
            <Button
              title={t('courierCall')}
              variant="outline"
              icon="call-outline"
              onPress={() => void Linking.openURL(`tel:${job.customer?.phone ?? ''}`)}
            />
            <Button
              title={t('courierMap')}
              variant="outline"
              icon="map-outline"
              onPress={() =>
                void Linking.openURL(mapUrl(job.customer?.lat ?? 0, job.customer?.lng ?? 0))
              }
            />
          </View>
        </View>
      ) : null}
      {onAccept ? (
        <Button title={t('courierTake')} loading={busy} onPress={onAccept} testID="take-offer" />
      ) : null}
      {onMove
        ? job.allowedTransitions.map((to) =>
            to === 'HANDED_TO_DELIVERY' || to === 'DELIVERED' || to === 'DELIVERY_FAILED' ? (
              <Button
                key={to}
                title={t(`courierAction_${to}`)}
                variant={to === 'DELIVERY_FAILED' ? 'outline' : 'primary'}
                loading={busy}
                onPress={() => {
                  onMove(to);
                }}
              />
            ) : null,
          )
        : null}
    </Card>
  );
}

/**
 * Courier mode (ADR 0024): go online with the phone's position, see nearby
 * offers, take one, pick it up when ready and deliver. While online the app
 * sends its position every 10 seconds (only while it is open).
 */
export function CourierScreen() {
  const { api, t, locale, errorText } = useApp();
  const me = useRequest(() => api.request('/courier/me', { schema: courierMeSchema }), []);
  const online = me.data?.online === true;
  const offers = useRequest(
    () =>
      online
        ? api.request('/courier/offers', { schema: courierOffersSchema })
        : Promise.resolve({ items: [] }),
    [online],
  );
  const [busy, setBusy] = useState(false);
  const reloadMe = me.reload;
  const reloadOffers = offers.reload;

  useEffect(() => {
    if (!online) return;
    const timer = setInterval(() => {
      void currentPoint().then((p) => {
        if (p)
          void api.request('/courier/location', { method: 'PUT', body: p }).catch(() => undefined);
      });
      reloadOffers();
      reloadMe();
    }, 10_000);
    return () => {
      clearInterval(timer);
    };
  }, [api, online, reloadMe, reloadOffers]);

  if (me.error && !me.data) {
    if (me.error.code === 'NOT_A_COURIER' || me.error.code === 'COURIER_SUSPENDED') {
      return (
        <Screen>
          <AppText>{errorText(me.error)}</AppText>
        </Screen>
      );
    }
    return <ErrorState error={me.error} onRetry={me.reload} />;
  }
  if (!me.data) return <Loading />;
  const profile = me.data;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      notify(err instanceof ApiError ? errorText(err) : t('error_generic'));
    } finally {
      setBusy(false);
      reloadMe();
      reloadOffers();
    }
  }

  async function toggle() {
    if (profile.online) {
      await run(() => api.request('/courier/status', { method: 'PUT', body: { online: false } }));
      return;
    }
    const here = await currentPoint();
    if (!here) {
      notify(t('foodLocationDenied'));
      return;
    }
    await run(() =>
      api.request('/courier/status', { method: 'PUT', body: { online: true, ...here } }),
    );
  }

  const balance = BigInt(profile.balanceTiyin);
  return (
    <Screen>
      <Stack.Screen options={{ title: t('courierTitle') }} />
      <Card>
        <Row
          label={t('courierBalance')}
          value={`${balance < 0n ? '−' : ''}${formatPrice((balance < 0n ? -balance : balance).toString(), locale)}`}
          strong
        />
        <AppText variant="small">{balance < 0n ? t('courierOwes') : t('courierEarned')}</AppText>
        <Button
          title={profile.online ? t('courierGoOffline') : t('courierGoOnline')}
          variant={profile.online ? 'outline' : 'primary'}
          icon={profile.online ? 'pause-circle-outline' : 'navigate-outline'}
          loading={busy}
          onPress={() => void toggle()}
          testID="courier-toggle"
        />
        {profile.online ? <AppText variant="small">{t('courierOnlineHint')}</AppText> : null}
      </Card>

      {profile.active.length > 0 ? (
        <View style={{ gap: spacing.md }}>
          <AppText variant="heading">{t('courierActive')}</AppText>
          {profile.active.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              busy={busy}
              onMove={(to) => {
                const go = () =>
                  void run(() =>
                    api.request(`/courier/orders/${job.id}/transition`, {
                      method: 'POST',
                      body: { to },
                    }),
                  );
                if (to === 'DELIVERY_FAILED') {
                  void confirmAction(
                    t('actionConfirm', { action: t(`courierAction_${to}`) }),
                    t(`courierAction_${to}`),
                    t('cancel'),
                    true,
                  ).then((ok) => {
                    if (ok) go();
                  });
                } else go();
              }}
            />
          ))}
        </View>
      ) : null}

      {profile.online ? (
        <View style={{ gap: spacing.md }}>
          <AppText variant="heading">{t('courierOffers')}</AppText>
          {(offers.data?.items ?? []).length === 0 ? (
            <AppText variant="muted">{t('courierNoOffers')}</AppText>
          ) : (
            (offers.data?.items ?? []).map((job) => (
              <JobCard
                key={job.id}
                job={job}
                busy={busy}
                onAccept={() =>
                  void run(() =>
                    api.request(`/courier/offers/${job.id}/accept`, { method: 'POST' }),
                  )
                }
              />
            ))
          )}
        </View>
      ) : null}
    </Screen>
  );
}
