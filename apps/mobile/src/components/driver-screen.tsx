import {
  type DriverAction,
  type DriverApplicationView,
  type DriverJob,
  driverApplicationResponseSchema,
  driverMeSchema,
  driverOffersSchema,
  type RideClass,
} from '@uzgo/contracts';
import { formatPrice } from '@uzgo/ui/lib/money';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Switch, View } from 'react-native';
import {
  AppText,
  Badge,
  Button,
  Card,
  Choice,
  ErrorState,
  Field,
  Loading,
  Row,
  Screen,
} from '@/components/ui';
import { ApiError } from '@/lib/api';
import { confirmAction, notify } from '@/lib/dialogs';
import { currentPoint } from '@/lib/location';
import { spacing } from '@/lib/theme';
import { useRequest } from '@/lib/use-request';
import { useApp } from '@/state/app';

/** OpenStreetMap link (no embedded map tiles: ADR 0025). */
const mapUrl = (lat: number, lng: number) =>
  `https://www.openstreetmap.org/?mlat=${lat.toFixed(5)}&mlon=${lng.toFixed(5)}#map=17/${lat.toFixed(5)}/${lng.toFixed(5)}`;
const km = (m: number) => (m / 1000).toFixed(1);

/** Apply as a driver, or correct a rejected application. */
function ApplicationForm({
  current,
  onSent,
}: {
  current: DriverApplicationView | null;
  onSent: () => void;
}) {
  const { api, t, errorText } = useApp();
  const [form, setForm] = useState({
    firstName: current?.firstName ?? '',
    lastName: current?.lastName ?? '',
    licenceNumber: current?.licenceNumber ?? '',
    permitNumber: current?.permitNumber ?? '',
    carMake: current?.car.make ?? '',
    carModel: current?.car.model ?? '',
    carColor: current?.car.color ?? '',
    carYear: current ? String(current.car.year) : '',
    plateNumber: current?.car.plate ?? '',
  });
  const [rideClass, setRideClass] = useState<RideClass>(current?.rideClass ?? 'ECONOMY');
  const [terms, setTerms] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = (key: keyof typeof form, label: string, extra: object = {}) => (
    <Field
      label={label}
      value={form[key]}
      onChangeText={(value: string) => {
        setForm((f) => ({ ...f, [key]: value }));
      }}
      maxLength={60}
      {...extra}
    />
  );

  async function send() {
    setPending(true);
    setError(null);
    try {
      await api.request('/driver/application', {
        method: 'PUT',
        body: {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          licenceNumber: form.licenceNumber,
          ...(form.permitNumber.trim() ? { permitNumber: form.permitNumber.trim() } : {}),
          carMake: form.carMake.trim(),
          carModel: form.carModel.trim(),
          carColor: form.carColor.trim(),
          carYear: Number(form.carYear),
          plateNumber: form.plateNumber,
          rideClass,
          acceptTerms: terms,
        },
      });
      notify(t('driverSent'));
      onSent();
    } catch (err) {
      setError(err instanceof ApiError ? errorText(err) : t('error_generic'));
    } finally {
      setPending(false);
    }
  }

  const ready =
    terms &&
    form.firstName.trim() &&
    form.lastName.trim() &&
    form.licenceNumber.trim().length >= 6 &&
    form.carMake.trim() &&
    form.carModel.trim() &&
    form.carColor.trim() &&
    Number(form.carYear) >= 1980 &&
    form.plateNumber.trim().length >= 7;

  return (
    <Card>
      <AppText variant="heading">{t('driverAboutYou')}</AppText>
      {field('firstName', t('driverFirstName'))}
      {field('lastName', t('driverLastName'))}
      {field('licenceNumber', t('driverLicence'), { autoCapitalize: 'characters' })}
      {field('permitNumber', t('driverPermit'))}
      <AppText variant="heading">{t('driverAboutCar')}</AppText>
      {field('carMake', t('driverCarMake'))}
      {field('carModel', t('driverCarModel'))}
      {field('carColor', t('driverCarColor'))}
      {field('carYear', t('driverCarYear'), { keyboardType: 'number-pad', maxLength: 4 })}
      {field('plateNumber', t('driverPlate'), { autoCapitalize: 'characters', maxLength: 12 })}
      {(['ECONOMY', 'COMFORT'] as const).map((cls) => (
        <Choice
          key={cls}
          label={t(`rideClass_${cls}`)}
          selected={rideClass === cls}
          onPress={() => {
            setRideClass(cls);
          }}
        />
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Switch
          value={terms}
          onValueChange={setTerms}
          accessibilityLabel={t('driverTerms')}
          testID="driver-terms"
        />
        <AppText variant="small" style={{ flex: 1 }}>
          {t('driverTerms')}
        </AppText>
      </View>
      {error ? (
        <AppText color="destructive" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
      <Button
        title={current ? t('driverResend') : t('driverSend')}
        loading={pending}
        disabled={!ready}
        onPress={() => void send()}
        testID="driver-send"
      />
    </Card>
  );
}

function JobCard({
  job,
  busy,
  onAccept,
  onAction,
}: {
  job: DriverJob;
  busy: boolean;
  onAccept?: () => void;
  onAction?: (action: DriverAction) => void;
}) {
  const { t, locale } = useApp();
  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
        <AppText variant="heading" style={{ flex: 1 }}>
          {formatPrice(job.priceTiyin, locale)}
        </AppText>
        <Badge label={t(`rideStatus_${job.status}`)} />
      </View>
      <Row label={t('goFrom')} value={job.pickup.label} />
      <Row label={t('goTo')} value={job.dropoff.label} />
      <Row
        label={t('driverRoute')}
        value={t('driverKm', {
          toPickup: job.toPickupM === null ? '—' : km(job.toPickupM),
          trip: km(job.distanceM),
        })}
      />
      <Row label={t('driverEarnings')} value={formatPrice(job.earningsTiyin, locale)} />
      {job.collectTiyin ? (
        <Row label={t('driverCollect')} value={formatPrice(job.collectTiyin, locale)} strong />
      ) : (
        <AppText variant="small">{t('driverPaidOnline')}</AppText>
      )}
      {job.rider ? (
        <View style={{ gap: spacing.xs }}>
          <AppText style={{ fontWeight: '600' }}>{job.rider.name}</AppText>
          {job.rider.comment ? <AppText variant="small">{job.rider.comment}</AppText> : null}
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
            <Button
              title={t('courierCall')}
              variant="outline"
              icon="call-outline"
              onPress={() => void Linking.openURL(`tel:${job.rider?.phone ?? ''}`)}
            />
            <Button
              title={t('courierMap')}
              variant="outline"
              icon="map-outline"
              onPress={() =>
                void Linking.openURL(
                  job.status === 'IN_PROGRESS'
                    ? mapUrl(job.dropoff.lat, job.dropoff.lng)
                    : mapUrl(job.pickup.lat, job.pickup.lng),
                )
              }
            />
          </View>
        </View>
      ) : null}
      {onAccept ? (
        <Button title={t('driverTake')} loading={busy} onPress={onAccept} testID="take-ride" />
      ) : null}
      {onAction
        ? job.allowedActions.map((action) => (
            <Button
              key={action}
              title={t(`driverAction_${action}`)}
              variant={action === 'RELEASE' || action === 'NO_SHOW' ? 'outline' : 'primary'}
              loading={busy}
              onPress={() => {
                onAction(action);
              }}
            />
          ))
        : null}
    </Card>
  );
}

/**
 * Driver mode (ADR 0025): go online with the phone's position, see ride
 * requests nearby, take one, arrive, start and complete the trip. While
 * online the app sends its position every 10 seconds (only while it is open).
 */
function DriverMode() {
  const { api, t, locale, errorText } = useApp();
  const me = useRequest(() => api.request('/driver/me', { schema: driverMeSchema }), []);
  const online = me.data?.online === true;
  const offers = useRequest(
    () =>
      online && !me.data?.active
        ? api.request('/driver/offers', { schema: driverOffersSchema })
        : Promise.resolve({ items: [] }),
    [online, me.data?.active?.id],
  );
  const [busy, setBusy] = useState(false);
  const reloadMe = me.reload;
  const reloadOffers = offers.reload;

  useEffect(() => {
    if (!online) return;
    const timer = setInterval(() => {
      void currentPoint().then((p) => {
        if (p)
          void api.request('/driver/location', { method: 'PUT', body: p }).catch(() => undefined);
      });
      reloadOffers();
      reloadMe();
    }, 10_000);
    return () => {
      clearInterval(timer);
    };
  }, [api, online, reloadMe, reloadOffers]);

  if (me.error && !me.data) {
    if (me.error.code === 'DRIVER_SUSPENDED') return <AppText>{errorText(me.error)}</AppText>;
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
      await run(() => api.request('/driver/status', { method: 'PUT', body: { online: false } }));
      return;
    }
    const here = await currentPoint();
    if (!here) {
      notify(t('foodLocationDenied'));
      return;
    }
    await run(() =>
      api.request('/driver/status', { method: 'PUT', body: { online: true, ...here } }),
    );
  }

  const balance = BigInt(profile.balanceTiyin);
  const active = profile.active;
  return (
    <>
      <Card>
        <AppText>{`${profile.car.color} ${profile.car.make} ${profile.car.model} · ${profile.car.plate}`}</AppText>
        <Row
          label={t('courierBalance')}
          value={`${balance < 0n ? '−' : ''}${formatPrice((balance < 0n ? -balance : balance).toString(), locale)}`}
          strong
        />
        <AppText variant="small">{balance < 0n ? t('driverOwes') : t('courierEarned')}</AppText>
        <Button
          title={profile.online ? t('courierGoOffline') : t('courierGoOnline')}
          variant={profile.online ? 'outline' : 'primary'}
          icon={profile.online ? 'pause-circle-outline' : 'navigate-outline'}
          loading={busy}
          onPress={() => void toggle()}
          testID="driver-toggle"
        />
        {profile.online ? <AppText variant="small">{t('courierOnlineHint')}</AppText> : null}
      </Card>
      {active ? (
        <View style={{ gap: spacing.md }}>
          <AppText variant="heading">{t('driverActive')}</AppText>
          <JobCard
            job={active}
            busy={busy}
            onAction={(action) => {
              const go = () =>
                void run(() =>
                  api.request(`/driver/rides/${active.id}/action`, {
                    method: 'POST',
                    body: { action },
                  }),
                );
              if (action === 'RELEASE' || action === 'NO_SHOW') {
                void confirmAction(
                  t('actionConfirm', { action: t(`driverAction_${action}`) }),
                  t(`driverAction_${action}`),
                  t('cancel'),
                  true,
                ).then((ok) => {
                  if (ok) go();
                });
              } else go();
            }}
          />
        </View>
      ) : profile.online ? (
        <View style={{ gap: spacing.md }}>
          <AppText variant="heading">{t('driverOffers')}</AppText>
          {(offers.data?.items ?? []).length === 0 ? (
            <AppText variant="muted">{t('driverNoOffers')}</AppText>
          ) : (
            (offers.data?.items ?? []).map((job) => (
              <JobCard
                key={job.id}
                job={job}
                busy={busy}
                onAccept={() =>
                  void run(() => api.request(`/driver/offers/${job.id}/accept`, { method: 'POST' }))
                }
              />
            ))
          )}
        </View>
      ) : null}
    </>
  );
}

/** "Driver" in the app: application and review status, then the driver mode. */
export function DriverScreen() {
  const { api, t } = useApp();
  const application = useRequest(
    () => api.request('/driver/application', { schema: driverApplicationResponseSchema }),
    [],
  );
  if (application.error && !application.data)
    return <ErrorState error={application.error} onRetry={application.reload} />;
  if (!application.data) return <Loading />;
  const current = application.data.application;
  const status = current?.status ?? null;
  return (
    <Screen>
      <Stack.Screen options={{ title: status === 'ACTIVE' ? t('driverMode') : t('driverTitle') }} />
      {status === 'ACTIVE' ? (
        <DriverMode />
      ) : (
        <>
          {status ? (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <AppText variant="heading">{t('driverStatusTitle')}</AppText>
                <Badge label={t(`driverStatus_${status}`)} />
              </View>
              <AppText variant="small" testID="driver-status">
                {t(`driverStatusText_${status}`)}
              </AppText>
              {current?.reviewNote ? (
                <AppText>{t('driverNote', { note: current.reviewNote })}</AppText>
              ) : null}
            </Card>
          ) : (
            <AppText variant="muted">{t('driverIntro')}</AppText>
          )}
          {status === null || status === 'PENDING' || status === 'REJECTED' ? (
            <ApplicationForm current={current} onSent={application.reload} />
          ) : null}
        </>
      )}
    </Screen>
  );
}
