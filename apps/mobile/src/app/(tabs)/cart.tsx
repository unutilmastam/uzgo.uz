import Ionicons from '@expo/vector-icons/Ionicons';
import { type CartLine, cartResponseSchema } from '@uzgo/contracts';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Stepper } from '@/components/stepper';
import {
  AppText,
  Button,
  Card,
  Divider,
  EmptyState,
  Loading,
  Price,
  Row,
  Screen,
  styles as ui,
} from '@/components/ui';
import { mediaUrl } from '@/lib/config';
import { localized } from '@/lib/format';
import { radius, spacing, useColors } from '@/lib/theme';
import { useApp } from '@/state/app';

function Line({ line, onChanged }: { line: CartLine; onChanged: () => void }) {
  const { api, t, locale, setCart, errorText } = useApp();
  const c = useColors();
  const [error, setError] = useState<string | null>(null);
  const title = localized(line.title, locale);
  const image = mediaUrl(line.imageUrl);

  async function update(quantity: number | null) {
    setError(null);
    try {
      const path = `/cart/items/${line.variantId}`;
      const res =
        quantity === null
          ? await api.request(path, { method: 'DELETE', schema: cartResponseSchema })
          : await api.request(path, {
              method: 'PATCH',
              body: { quantity },
              schema: cartResponseSchema,
            });
      setCart(res.cart);
      onChanged();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={[ui.row, { alignItems: 'flex-start' }]}>
        <Pressable
          onPress={() => {
            router.push(`/product/${line.productSlug}`);
          }}
          accessibilityRole="link"
          accessibilityLabel={title}
        >
          <View style={[styles.thumb, { backgroundColor: c.muted }]}>
            {image ? (
              <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <Ionicons name="image-outline" size={24} color={c.mutedForeground} />
            )}
          </View>
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText numberOfLines={2}>{title}</AppText>
          {line.options.length > 0 ? (
            <AppText variant="small">
              {line.options.map((o) => localized(o, locale)).join(', ')}
            </AppText>
          ) : null}
          <Price value={line.unitPriceTiyin} />
          {line.status === 'INSUFFICIENT_STOCK' ? (
            <AppText variant="small" color="destructive">
              {t('lineInsufficient', { available: line.available })}
            </AppText>
          ) : line.status === 'UNAVAILABLE' ? (
            <AppText variant="small" color="destructive">
              {t('lineUnavailable')}
            </AppText>
          ) : null}
        </View>
      </View>
      <View style={ui.between}>
        {line.status === 'UNAVAILABLE' ? (
          <View />
        ) : (
          <Stepper
            value={Math.min(line.quantity, Math.max(line.available, 1))}
            max={Math.max(line.available, 1)}
            onChange={(q) => void update(q)}
          />
        )}
        <Button
          title={t('remove')}
          variant="ghost"
          icon="trash-outline"
          onPress={() => void update(null)}
        />
      </View>
      {error ? (
        <AppText variant="small" color="destructive">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

export default function CartScreen() {
  const { cart, refreshCart, user, t, locale } = useApp();
  const [refreshing, setRefreshing] = useState(false);

  // Prices and stock can change on the server: reload whenever the tab is shown.
  useFocusEffect(
    useCallback(() => {
      void refreshCart();
    }, [refreshCart]),
  );

  if (!cart) return <Loading />;
  if (cart.groups.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="bag-outline"
          title={t('cartEmpty')}
          text={t('cartEmptyHint')}
          action={{
            title: t('startShopping'),
            onPress: () => {
              router.navigate('/catalog');
            },
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void refreshCart().finally(() => {
              setRefreshing(false);
            });
          }}
        />
      }
    >
      {cart.groups.map((group) => (
        <Card key={group.store.id}>
          <AppText variant="small" style={{ fontWeight: '700' }}>
            {t('fromStore', { store: localized(group.store.name, locale) })}
          </AppText>
          {group.lines.map((line, index) => (
            <View key={line.variantId} style={{ gap: spacing.md }}>
              {index > 0 ? <Divider /> : null}
              <Line line={line} onChanged={() => undefined} />
            </View>
          ))}
        </Card>
      ))}
      <Card>
        <Row
          label={t('itemCount', { count: cart.itemCount })}
          value={<Price value={cart.subtotalTiyin} />}
        />
        <Divider />
        <Row label={t('total')} value={<Price value={cart.totalTiyin} />} strong />
        {cart.hasIssues ? (
          <AppText variant="small" color="destructive">
            {t('fixIssues')}
          </AppText>
        ) : null}
        <Button
          title={user ? t('checkout') : t('loginToCheckout')}
          disabled={cart.hasIssues}
          onPress={() => {
            router.push(user ? '/checkout' : { pathname: '/login', params: { next: '/checkout' } });
          }}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  thumb: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
