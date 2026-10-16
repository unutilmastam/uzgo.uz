import {
  type FoodQuote,
  foodQuoteSchema,
  orderResponseSchema,
  type PaymentMethod,
  paymentMethodsResponseSchema,
  restaurantDetailSchema,
} from '@uzgo/contracts';
import { formatPrice } from '@uzgo/ui/lib/money';
import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { FoodPointPicker } from '@/components/food-point-picker';
import { Stepper } from '@/components/stepper';
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
  styles as ui,
} from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useFoodPoint } from '@/lib/food-point';
import { formatPhone, localized, toApiPhone } from '@/lib/format';
import { isOnlineMethod, payOrder } from '@/lib/payments';
import { spacing } from '@/lib/theme';
import { useRequest } from '@/lib/use-request';
import { useApp } from '@/state/app';

/** Restaurant: menu, basket and ordering; the server prices everything (ADR 0024). */
export default function RestaurantScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { api, t, locale, user, errorText } = useApp();
  const point = useFoodPoint();
  const detail = useRequest(
    () =>
      api.request(`/food/restaurants/${encodeURIComponent(slug)}`, {
        schema: restaurantDetailSchema,
      }),
    [slug],
  );
  const methods = useRequest(
    () => api.request('/payments/methods', { schema: paymentMethodsResponseSchema }),
    [],
  );
  const [basket, setBasket] = useState<Record<string, number>>({});
  const [quote, setQuote] = useState<FoodQuote | null>(null);
  const [addressLine, setAddressLine] = useState('');
  const [name, setName] = useState(user?.profile.firstName ?? '');
  const [phone, setPhone] = useState(user ? formatPhone(user.phone) : '');
  const [method, setMethod] = useState<PaymentMethod>('CASH_ON_DELIVERY');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ body: string; key: string } | null>(null);

  const restaurant = detail.data;
  const lines = Object.entries(basket)
    .filter(([, q]) => q > 0)
    .map(([menuItemId, quantity]) => ({ menuItemId, quantity }));
  const linesKey = JSON.stringify(lines);

  useEffect(() => {
    const parsed = JSON.parse(linesKey) as { menuItemId: string; quantity: number }[];
    if (!restaurant || !point || parsed.length === 0) return;
    let active = true;
    api
      .request('/food/quote', {
        method: 'POST',
        body: { restaurantId: restaurant.id, items: parsed, lat: point.lat, lng: point.lng },
        schema: foodQuoteSchema,
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
  }, [api, linesKey, point, restaurant]);

  if (detail.error && !restaurant)
    return <ErrorState error={detail.error} onRetry={detail.reload} />;
  if (!restaurant) return <Loading />;
  const shownQuote = lines.length > 0 && point ? quote : null;

  async function placeOrder() {
    if (!restaurant || !point || !shownQuote?.available) return;
    const body = {
      restaurantId: restaurant.id,
      items: lines,
      lat: point.lat,
      lng: point.lng,
      addressLine: addressLine.trim(),
      recipientName: name.trim(),
      recipientPhone: toApiPhone(phone),
      paymentMethod: method,
      expectedTotalTiyin: shownQuote.totalTiyin,
    };
    const serialized = JSON.stringify(body);
    if (attempt.current?.body !== serialized)
      attempt.current = { body: serialized, key: randomUUID() };
    setPending(true);
    setError(null);
    try {
      const { order } = await api.request('/food/checkout', {
        method: 'POST',
        body,
        idempotencyKey: attempt.current.key,
        schema: orderResponseSchema,
      });
      setBasket({});
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
      if (
        err instanceof ApiError &&
        (err.code === 'PRICE_CHANGED' || err.code === 'FOOD_UNAVAILABLE')
      ) {
        setError(t('foodChanged'));
        detail.reload();
      } else {
        setError(errorText(err));
      }
    } finally {
      setPending(false);
    }
  }

  const ready =
    shownQuote?.available === true &&
    addressLine.trim().length >= 3 &&
    name.trim().length >= 2 &&
    phone.trim().length >= 7;

  return (
    <Screen>
      <Stack.Screen options={{ title: localized(restaurant.name, locale) }} />
      <View style={{ gap: 4 }}>
        <AppText variant="title" accessibilityRole="header">
          {localized(restaurant.name, locale)}
        </AppText>
        <AppText variant="small">
          {[
            restaurant.openNow ? t('foodOpen') : t('foodClosed'),
            restaurant.address,
            t('foodPrep', { minutes: restaurant.prepMinutes }),
          ].join(' · ')}
        </AppText>
      </View>
      {restaurant.menu.map((category) => (
        <Card key={category.id}>
          <AppText variant="heading">{localized(category.name, locale)}</AppText>
          {category.items.map((dish) => (
            <View key={dish.id} style={{ gap: spacing.xs }} testID="dish">
              <View style={ui.between}>
                <AppText style={{ flex: 1 }}>{localized(dish.name, locale)}</AppText>
                <Price value={dish.priceTiyin} />
              </View>
              {dish.description ? (
                <AppText variant="small">{localized(dish.description, locale)}</AppText>
              ) : null}
              {dish.available ? (
                (basket[dish.id] ?? 0) === 0 ? (
                  <Button
                    title={t('foodAdd')}
                    variant="outline"
                    icon="add"
                    accessibilityLabel={t('foodAddNamed', { name: localized(dish.name, locale) })}
                    onPress={() => {
                      setBasket((b) => ({ ...b, [dish.id]: 1 }));
                    }}
                  />
                ) : (
                  <Stepper
                    value={basket[dish.id] ?? 0}
                    min={0}
                    max={50}
                    onChange={(value) => {
                      setBasket((b) => ({ ...b, [dish.id]: value }));
                    }}
                  />
                )
              ) : (
                <AppText variant="small">{t('foodSoldOut')}</AppText>
              )}
            </View>
          ))}
        </Card>
      ))}

      <Card>
        <AppText variant="heading">{t('foodDeliverTo')}</AppText>
        <FoodPointPicker />
      </Card>

      {lines.length > 0 ? (
        <Card>
          <AppText variant="heading">{t('foodBasket')}</AppText>
          {shownQuote ? (
            <View style={{ gap: spacing.sm }}>
              <Row label={t('itemsLine')} value={<Price value={shownQuote.itemsTotalTiyin} />} />
              <Row
                label={t('deliveryLine')}
                value={
                  shownQuote.deliveryTiyin === '0'
                    ? t('foodFreeDelivery')
                    : formatPrice(shownQuote.deliveryTiyin, locale)
                }
              />
              <Divider />
              <Row label={t('total')} value={<Price value={shownQuote.totalTiyin} />} strong />
              <AppText variant="small">{t('foodEta', { minutes: shownQuote.etaMinutes })}</AppText>
              {shownQuote.reason ? (
                <AppText color="destructive" testID="food-reason">
                  {shownQuote.reason === 'MIN_ORDER'
                    ? t('foodReason_MIN_ORDER', {
                        amount: formatPrice(shownQuote.minOrderTiyin, locale),
                      })
                    : t(`foodReason_${shownQuote.reason}`)}
                </AppText>
              ) : null}
            </View>
          ) : (
            <AppText variant="muted">{t('foodPointForTotal')}</AppText>
          )}
          {!user ? (
            <Button
              title={t('foodLoginToOrder')}
              onPress={() => {
                router.push({ pathname: '/login', params: { next: `/food/${restaurant.slug}` } });
              }}
            />
          ) : shownQuote?.available ? (
            <View style={{ gap: spacing.md }}>
              <Field
                label={t('foodAddressLine')}
                value={addressLine}
                onChangeText={setAddressLine}
                maxLength={200}
              />
              <Field
                label={t('recipientName')}
                value={name}
                onChangeText={setName}
                maxLength={100}
              />
              <Field
                label={t('recipientPhone')}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                maxLength={20}
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
                title={t('foodPlaceOrder')}
                loading={pending}
                disabled={!ready}
                onPress={() => void placeOrder()}
              />
            </View>
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}
