import {
  districtsResponseSchema,
  type PaymentMethod,
  paymentMethodsResponseSchema,
  type RideClass,
  type RideQuote,
  rideListSchema,
  rideQuoteSchema,
  regionsResponseSchema,
  rideViewSchema,
} from '@uzgo/contracts';
import { formatPrice } from '@uzgo/ui/lib/money';
import { randomUUID } from 'expo-crypto';
import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { z } from 'zod';
import { FoodPointPicker } from '@/components/food-point-picker';
import { SelectField } from '@/components/select';
import { AppText, Badge, Button, Card, Choice, Field, Price, Screen } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { usePoint } from '@/lib/food-point';
import { localized } from '@/lib/format';
import { isOnlineMethod, payOrder } from '@/lib/payments';
import { radius, spacing, useColors } from '@/lib/theme';
import { useRequest } from '@/lib/use-request';
import { useApp } from '@/state/app';

const OPEN = new Set(['AWAITING_PAYMENT', 'SEARCHING', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS']);
const rideResponse = z.object({ ride: rideViewSchema });

/** UZGO Go: where from, where to, fixed price, call a car (ADR 0025). */
export default function GoScreen() {
  const { api, t, locale, user, errorText } = useApp();
  const c = useColors();
  const pickup = usePoint('pickup');
  const dropoff = usePoint('dropoff');
  const rides = useRequest(
    () =>
      user ? api.request('/rides', { schema: rideListSchema }) : Promise.resolve({ items: [] }),
    [user?.id],
  );
  const methods = useRequest(
    () => api.request('/payments/methods', { schema: paymentMethodsResponseSchema }),
    [],
  );
  const regions = useRequest(
    () => api.request('/geo/regions', { schema: regionsResponseSchema }),
    [],
  );
  const [regionId, setRegionId] = useState<string | null>(user?.profile.regionId ?? null);
  const [districtId, setDistrictId] = useState<string | null>(user?.profile.districtId ?? null);
  const districts = useRequest(
    () =>
      regionId
        ? api.request(`/geo/regions/${regionId}/districts`, { schema: districtsResponseSchema })
        : Promise.resolve({ items: [] }),
    [regionId],
  );
  const [quote, setQuote] = useState<RideQuote | null>(null);
  const [rideClass, setRideClass] = useState<RideClass>('ECONOMY');
  const [method, setMethod] = useState<PaymentMethod>('CASH_ON_DELIVERY');
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ body: string; key: string } | null>(null);

  const pointsKey = pickup && dropoff ? JSON.stringify([pickup, dropoff]) : '';
  useEffect(() => {
    if (!pointsKey) return;
    const [from, to] = JSON.parse(pointsKey) as [
      { lat: number; lng: number },
      { lat: number; lng: number },
    ];
    let active = true;
    api
      .request('/rides/quote', {
        method: 'POST',
        body: { pickup: { lat: from.lat, lng: from.lng }, dropoff: { lat: to.lat, lng: to.lng } },
        schema: rideQuoteSchema,
      })
      .then(
        (q) => {
          if (active) setQuote(q);
        },
        () => {
          if (active) setQuote(null);
        },
      );
    return () => {
      active = false;
    };
  }, [api, pointsKey]);

  const shown = pointsKey ? quote : null;
  const price = shown?.options.find((o) => o.rideClass === rideClass)?.priceTiyin ?? null;
  const tooShort = shown !== null && shown.distanceM < 200;
  const open = (rides.data?.items ?? []).find((r) => OPEN.has(r.status));
  const ready =
    Boolean(user && pickup && dropoff && price && districtId) &&
    shown?.tooFar === false &&
    !tooShort;

  async function call() {
    if (!ready || !pickup || !dropoff || !price || !districtId) return;
    const body = {
      rideClass,
      pickup,
      dropoff,
      districtId,
      paymentMethod: method,
      expectedPriceTiyin: price,
      ...(comment.trim() ? { comment: comment.trim() } : {}),
    };
    const serialized = JSON.stringify(body);
    if (attempt.current?.body !== serialized)
      attempt.current = { body: serialized, key: randomUUID() };
    setPending(true);
    setError(null);
    try {
      const { ride } = await api.request('/rides', {
        method: 'POST',
        body,
        idempotencyKey: attempt.current.key,
        schema: rideResponse,
      });
      if (isOnlineMethod(ride.paymentMethod)) {
        try {
          await payOrder(api, ride.number, ride.paymentMethod, locale);
        } catch {
          // The ride screen offers "Pay now" again.
        }
      }
      router.replace({ pathname: '/go/[number]', params: { number: ride.number } });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PRICE_CHANGED') setQuote(null);
      setError(err instanceof ApiError ? errorText(err) : t('error_generic'));
    } finally {
      setPending(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('goTitle') }} />
      <AppText variant="muted">{t('goText')}</AppText>
      {open ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            router.push({ pathname: '/go/[number]', params: { number: open.number } });
          }}
          style={{
            padding: spacing.md,
            borderRadius: radius.lg,
            borderWidth: 2,
            borderColor: c.primary,
            gap: spacing.xs,
          }}
          testID="open-ride"
        >
          <AppText variant="heading">{t('goOpenRide')}</AppText>
          <AppText variant="small">{t(`rideStatus_${open.status}`)}</AppText>
        </Pressable>
      ) : (
        <>
          <Card>
            <AppText variant="heading">{t('goFrom')}</AppText>
            <FoodPointPicker slot="pickup" hint={t('goFromHint')} testID="pickup-point" />
          </Card>
          <Card>
            <AppText variant="heading">{t('goTo')}</AppText>
            <FoodPointPicker
              slot="dropoff"
              hint={t('goToHint')}
              locateLabel={t('goToHere')}
              testID="dropoff-point"
            />
          </Card>
          {shown ? (
            <Card>
              <AppText variant="heading">{t('goClass')}</AppText>
              <AppText variant="small" testID="ride-distance">
                {t('goTripInfo', {
                  km: (shown.distanceM / 1000).toFixed(1),
                  minutes: shown.etaMinutes,
                })}
              </AppText>
              {shown.options.map((o) => (
                <Choice
                  key={o.rideClass}
                  label={`${t(`rideClass_${o.rideClass}`)} · ${formatPrice(o.priceTiyin, locale)}`}
                  hint={
                    shown.driversNearby[o.rideClass] > 0
                      ? t('goDriversNearby', { count: shown.driversNearby[o.rideClass] })
                      : t('goNoDrivers')
                  }
                  selected={rideClass === o.rideClass}
                  onPress={() => {
                    setRideClass(o.rideClass);
                  }}
                />
              ))}
              {shown.tooFar ? (
                <AppText color="destructive">{t('error_RIDE_TOO_LONG')}</AppText>
              ) : tooShort ? (
                <AppText color="destructive">{t('error_RIDE_TOO_SHORT')}</AppText>
              ) : null}
              {!user ? (
                <Button
                  title={t('goLoginToRide')}
                  onPress={() => {
                    router.push({ pathname: '/login', params: { next: '/go' } });
                  }}
                />
              ) : (
                <View style={{ gap: spacing.md }}>
                  <SelectField
                    label={t('region')}
                    value={regionId}
                    options={(regions.data?.items ?? []).map((r) => ({
                      value: r.id,
                      label: localized(r.name, locale),
                    }))}
                    onChange={(value) => {
                      setRegionId(value);
                      setDistrictId(null);
                    }}
                  />
                  <SelectField
                    label={t('district')}
                    value={districtId}
                    disabled={!regionId || !districts.data}
                    options={(districts.data?.items ?? []).map((d) => ({
                      value: d.id,
                      label: localized(d.name, locale),
                    }))}
                    onChange={setDistrictId}
                  />
                  <Field
                    label={t('goComment')}
                    value={comment}
                    onChangeText={setComment}
                    maxLength={300}
                  />
                  {(methods.data?.items ?? ['CASH_ON_DELIVERY' as const]).map((m) => (
                    <Choice
                      key={m}
                      label={t(`method_${m}`)}
                      selected={method === m}
                      onPress={() => {
                        setMethod(m);
                      }}
                    />
                  ))}
                  {error ? (
                    <AppText color="destructive" accessibilityLiveRegion="polite">
                      {error}
                    </AppText>
                  ) : null}
                  <Button
                    title={price ? `${t('goCall')} · ${formatPrice(price, locale)}` : t('goCall')}
                    loading={pending}
                    disabled={!ready}
                    onPress={() => void call()}
                    testID="call-ride"
                  />
                </View>
              )}
            </Card>
          ) : (
            <AppText variant="muted">{t('goPointsForPrice')}</AppText>
          )}
        </>
      )}
      {(rides.data?.items ?? []).length > 0 ? (
        <Card>
          <AppText variant="heading">{t('goHistory')}</AppText>
          {(rides.data?.items ?? []).slice(0, 10).map((r) => (
            <Pressable
              key={r.number}
              accessibilityRole="link"
              onPress={() => {
                router.push({ pathname: '/go/[number]', params: { number: r.number } });
              }}
              style={{ gap: spacing.xs, paddingVertical: spacing.xs }}
            >
              <View
                style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}
              >
                <Badge label={t(`rideStatus_${r.status}`)} />
                <Price value={r.priceTiyin} />
              </View>
              <AppText variant="small" numberOfLines={1}>
                {`${r.pickupLabel} → ${r.dropoffLabel}`}
              </AppText>
            </Pressable>
          ))}
        </Card>
      ) : null}
      <Button
        title={t('goBecomeDriver')}
        variant="ghost"
        icon="car-outline"
        onPress={() => {
          router.push('/driver');
        }}
      />
    </Screen>
  );
}
