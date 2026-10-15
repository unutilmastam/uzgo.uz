import {
  type DeliveryType,
  deliveryQuoteSchema,
  districtsResponseSchema,
  orderResponseSchema,
  PROMO_CODE_PATTERN,
  type PaymentMethod,
  paymentMethodsResponseSchema,
  pickupPointsResponseSchema,
  regionsResponseSchema,
} from '@uzgo/contracts';
import { randomUUID } from 'expo-crypto';
import { Redirect, router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { SelectField } from '@/components/select';
import {
  AppText,
  Button,
  Card,
  Choice,
  Divider,
  ErrorState,
  Field,
  Loading,
  Price,
  Row,
  Screen,
} from '@/components/ui';
import { ApiError } from '@/lib/api';
import { formatPrice } from '@uzgo/ui/lib/money';
import { formatPhone, localized, toApiPhone } from '@/lib/format';
import { isOnlineMethod, payOrder } from '@/lib/payments';
import { spacing } from '@/lib/theme';
import { useRequest } from '@/lib/use-request';
import { useApp } from '@/state/app';

/**
 * Checkout: the server computes every amount (quote, then checkout with the
 * total the customer saw). Online methods open the provider's page in the
 * system browser; card data never touches the app.
 */
export default function CheckoutScreen() {
  const { api, t, locale, user, cart, refreshCart, errorText } = useApp();
  const [recipientName, setRecipientName] = useState(user?.profile.firstName ?? '');
  const [recipientPhone, setRecipientPhone] = useState(user ? formatPhone(user.phone) : '');
  const [regionId, setRegionId] = useState<string | null>(user?.profile.regionId ?? null);
  const [districtId, setDistrictId] = useState<string | null>(user?.profile.districtId ?? null);
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('COURIER');
  const [pickupPointId, setPickupPointId] = useState<string | null>(null);
  const [addressLine, setAddressLine] = useState('');
  const [comment, setComment] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH_ON_DELIVERY');
  const [pending, setPending] = useState(false);
  const [promoInput, setPromoInput] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [promoMalformed, setPromoMalformed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ body: string; key: string } | null>(null);

  const regions = useRequest(
    () => api.request('/geo/regions', { schema: regionsResponseSchema }),
    [],
  );
  const districts = useRequest(
    () =>
      regionId
        ? api.request(`/geo/regions/${regionId}/districts`, { schema: districtsResponseSchema })
        : Promise.resolve({ items: [] }),
    [regionId],
  );
  const methods = useRequest(
    () => api.request('/payments/methods', { schema: paymentMethodsResponseSchema }),
    [],
  );
  const pickupPoints = useRequest(
    () =>
      districtId && deliveryType === 'PICKUP'
        ? api.request(`/delivery/pickup-points?districtId=${districtId}`, {
            schema: pickupPointsResponseSchema,
          })
        : Promise.resolve({ items: [] }),
    [districtId, deliveryType],
  );
  const quote = useRequest(() => {
    if (!districtId) return Promise.resolve(null);
    const params = new URLSearchParams({ districtId, type: deliveryType });
    if (deliveryType === 'PICKUP' && pickupPointId) params.set('pickupPointId', pickupPointId);
    if (promoCode) params.set('promoCode', promoCode);
    return api.request(`/delivery/quote?${params.toString()}`, { schema: deliveryQuoteSchema });
  }, [districtId, deliveryType, pickupPointId, cart?.totalTiyin, promoCode]);

  if (!user) return <Redirect href={{ pathname: '/login', params: { next: '/checkout' } }} />;
  if (regions.error) return <ErrorState error={regions.error} onRetry={regions.reload} />;
  if (!regions.data || !methods.data) return <Loading />;

  const q = quote.data;
  const appliedPromo = q?.promo ?? null;
  const promoMessage = promoMalformed
    ? t('promo_PROMO_INVALID')
    : !promoCode
      ? null
      : q?.promoError
        ? q.promoError === 'PROMO_MIN_ORDER' && q.promoMinOrderTiyin
          ? t('promo_PROMO_MIN_ORDER', { amount: formatPrice(q.promoMinOrderTiyin, locale) })
          : t(`promo_${q.promoError}`)
        : !q
          ? t('promoAfterAddress')
          : null;

  function applyPromo() {
    const code = promoInput.trim().toUpperCase();
    const valid = PROMO_CODE_PATTERN.test(code);
    setPromoMalformed(code !== '' && !valid);
    setPromoCode(valid ? code : '');
  }
  const formReady =
    recipientName.trim().length >= 2 &&
    recipientPhone.trim().length >= 7 &&
    districtId !== null &&
    (deliveryType === 'PICKUP' ? pickupPointId !== null : addressLine.trim().length >= 5) &&
    q?.available === true;

  async function placeOrder() {
    if (!q || !districtId) return;
    const body = {
      recipientName: recipientName.trim(),
      recipientPhone: toApiPhone(recipientPhone),
      districtId,
      deliveryType,
      ...(deliveryType === 'PICKUP' && pickupPointId
        ? { pickupPointId }
        : { addressLine: addressLine.trim() }),
      ...(comment.trim() ? { comment: comment.trim() } : {}),
      paymentMethod: method,
      ...(appliedPromo ? { promoCode: appliedPromo.code } : {}),
      expectedTotalTiyin: q.totalTiyin,
    };
    // The same body keeps its Idempotency-Key, so a retry after a network
    // failure can never create a second order.
    const serialized = JSON.stringify(body);
    if (attempt.current?.body !== serialized)
      attempt.current = { body: serialized, key: randomUUID() };

    setPending(true);
    setError(null);
    try {
      const { order } = await api.request('/checkout', {
        method: 'POST',
        body,
        idempotencyKey: attempt.current.key,
        schema: orderResponseSchema,
      });
      await refreshCart();
      if (isOnlineMethod(order.paymentMethod) && order.paymentMethod !== 'DEV_ONLINE') {
        try {
          await payOrder(api, order.number, order.paymentMethod, locale);
        } catch {
          // The order page offers "Pay now" again.
        }
      }
      router.replace({
        pathname: '/order/[number]',
        params: { number: order.number, placed: '1' },
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PRICE_CHANGED') {
        setError(t('priceChanged'));
        quote.reload();
      } else if (err instanceof ApiError && err.code.startsWith('PROMO_')) {
        setPromoCode('');
        setError(t('promoChanged'));
      } else if (err instanceof ApiError && err.code === 'VALIDATION_FAILED') {
        setError(t('fillAllFields'));
      } else {
        setError(errorText(err));
      }
    } finally {
      setPending(false);
    }
  }

  const shipments = cart?.groups.length ?? 0;

  return (
    <Screen>
      <Stack.Screen options={{ title: t('checkoutTitle') }} />
      <Card>
        <Field
          label={t('recipientName')}
          value={recipientName}
          onChangeText={setRecipientName}
          autoComplete="name"
          maxLength={100}
        />
        <Field
          label={t('recipientPhone')}
          value={recipientPhone}
          onChangeText={setRecipientPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
          maxLength={20}
        />
        <SelectField
          label={t('region')}
          value={regionId}
          options={regions.data.items.map((r) => ({
            value: r.id,
            label: localized(r.name, locale),
          }))}
          onChange={(value) => {
            setRegionId(value);
            setDistrictId(null);
            setPickupPointId(null);
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
          onChange={(value) => {
            setDistrictId(value);
            setPickupPointId(null);
          }}
        />
      </Card>

      <Card>
        <AppText variant="heading">{t('deliveryType')}</AppText>
        <Choice
          label={t('courier')}
          selected={deliveryType === 'COURIER'}
          onPress={() => {
            setDeliveryType('COURIER');
          }}
        />
        <Choice
          label={t('pickup')}
          selected={deliveryType === 'PICKUP'}
          onPress={() => {
            setDeliveryType('PICKUP');
          }}
        />
        {deliveryType === 'COURIER' ? (
          <Field
            label={t('addressLine')}
            value={addressLine}
            onChangeText={setAddressLine}
            autoComplete="street-address"
            maxLength={200}
          />
        ) : districtId && pickupPoints.data?.items.length === 0 ? (
          <AppText variant="muted">{t('noPickupPoints')}</AppText>
        ) : (
          <SelectField
            label={t('pickupPoint')}
            value={pickupPointId}
            disabled={!districtId}
            options={(pickupPoints.data?.items ?? []).map((p) => ({
              value: p.id,
              label: localized(p.name, locale),
              hint: [p.address, p.hours].filter(Boolean).join(' · '),
            }))}
            onChange={setPickupPointId}
          />
        )}
        <Field
          label={t('comment')}
          value={comment}
          onChangeText={setComment}
          maxLength={500}
          multiline
        />
      </Card>

      <Card>
        <AppText variant="heading">{t('paymentTitle')}</AppText>
        {methods.data.items.map((item) => (
          <Choice
            key={item}
            label={t(`method_${item}`)}
            selected={method === item}
            onPress={() => {
              setMethod(item);
            }}
          />
        ))}
        {isOnlineMethod(method) ? (
          <AppText variant="small">
            {t('onlineNote', { minutes: methods.data.windowMinutes })}
          </AppText>
        ) : null}
      </Card>

      <Card>
        <Field
          label={t('promoLabel')}
          value={promoInput}
          onChangeText={setPromoInput}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={32}
          onSubmitEditing={applyPromo}
          testID="promo-input"
          {...(appliedPromo
            ? { hint: appliedPromo.description ?? t('promoApplied') }
            : promoMessage
              ? { error: promoMessage }
              : {})}
        />
        {promoCode && promoInput.trim().toUpperCase() === promoCode ? (
          <Button
            variant="outline"
            title={t('promoRemove')}
            onPress={() => {
              setPromoInput('');
              setPromoCode('');
              setPromoMalformed(false);
            }}
          />
        ) : (
          <Button variant="outline" title={t('promoApply')} onPress={applyPromo} />
        )}
      </Card>

      <Card>
        {q ? (
          <View style={{ gap: spacing.sm }}>
            <Row label={t('itemsLine')} value={<Price value={q.itemsTotalTiyin} />} />
            <Row
              label={t('deliveryLine')}
              value={
                q.etaDays === null ? (
                  t('deliveryAgreed')
                ) : q.deliveryTotalTiyin === '0' ? (
                  t('deliveryFree')
                ) : (
                  <Price value={q.deliveryTotalTiyin} />
                )
              }
            />
            {q.etaDays ? (
              <AppText variant="small">
                {t('eta', { min: q.etaDays.min, max: q.etaDays.max })}
              </AppText>
            ) : null}
            {appliedPromo && q.discountTiyin !== '0' ? (
              <Row
                label={t('discountLine', { code: appliedPromo.code })}
                value={t('discountAmount', { amount: formatPrice(q.discountTiyin, locale) })}
              />
            ) : null}
            <Divider />
            <Row label={t('total')} value={<Price value={q.totalTiyin} />} strong />
            {!q.available ? (
              <AppText variant="small" color="destructive">
                {t('error_DELIVERY_UNAVAILABLE')}
              </AppText>
            ) : null}
          </View>
        ) : (
          <Row label={t('total')} value={<Price value={cart?.totalTiyin ?? '0'} />} strong />
        )}
        {shipments > 0 ? (
          <AppText variant="small">{t('shipments', { count: shipments })}</AppText>
        ) : null}
        {error ? (
          <AppText color="destructive" accessibilityLiveRegion="polite">
            {error}
          </AppText>
        ) : null}
        <Button
          title={t('placeOrder')}
          loading={pending}
          disabled={!formReady || quote.loading}
          onPress={() => void placeOrder()}
        />
      </Card>
    </Screen>
  );
}
