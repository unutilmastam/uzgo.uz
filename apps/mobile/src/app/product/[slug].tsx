import Ionicons from '@expo/vector-icons/Ionicons';
import {
  cartResponseSchema,
  MAX_LINE_QUANTITY,
  productDetailResponseSchema,
} from '@uzgo/contracts';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  AppText,
  Badge,
  Button,
  Card,
  ErrorState,
  Loading,
  Price,
  Screen,
  styles as ui,
} from '@/components/ui';
import { mediaUrl } from '@/lib/config';
import { localized } from '@/lib/format';
import { radius, spacing, useColors } from '@/lib/theme';
import { useRequest } from '@/lib/use-request';
import { choose, defaultVariant, findVariant, optionGroups, selectionOf } from '@/lib/variants';
import { FavoriteButton } from '@/components/favorite-button';
import { Stepper } from '@/components/stepper';
import { useApp } from '@/state/app';

const WIDTH = Dimensions.get('window').width;

export default function ProductScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { api, t, locale, setCart, errorText } = useApp();
  const c = useColors();
  const detail = useRequest(
    () =>
      api.request(`/catalog/products/${encodeURIComponent(slug)}`, {
        schema: productDetailResponseSchema,
      }),
    [slug],
  );
  const product = detail.data?.product;
  const groups = useMemo(() => (product ? optionGroups(product.variants) : []), [product]);
  const [selection, setSelection] = useState<Record<string, string> | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [pending, setPending] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (detail.error && !product) return <ErrorState error={detail.error} onRetry={detail.reload} />;
  if (!product) return <Loading />;

  const fallback = defaultVariant(product.variants);
  const current = selection ?? (fallback ? selectionOf(fallback) : {});
  const variant = findVariant(product.variants, current) ?? fallback;
  const max = Math.min(variant?.available ?? 0, MAX_LINE_QUANTITY);
  const title = localized(product.title, locale);

  async function add() {
    if (!variant) return;
    setPending(true);
    setError(null);
    try {
      const res = await api.request('/cart/items', {
        method: 'POST',
        body: { variantId: variant.id, quantity },
        schema: cartResponseSchema,
      });
      setCart(res.cart);
      setAdded(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: '' }} />
      <Screen padded={false}>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
          {product.images.length > 0 ? (
            product.images.map((image, index) => (
              <Image
                key={image.url}
                source={mediaUrl(image.url)}
                style={{ width: WIDTH, height: WIDTH, backgroundColor: c.muted }}
                contentFit="cover"
                accessibilityLabel={`${title} ${String(index + 1)}`}
              />
            ))
          ) : (
            <View style={[styles.noImage, { width: WIDTH, backgroundColor: c.muted }]}>
              <Ionicons name="image-outline" size={48} color={c.mutedForeground} />
              <AppText variant="small">{t('noImage')}</AppText>
            </View>
          )}
        </ScrollView>
        <View style={{ padding: spacing.lg, gap: spacing.lg }}>
          {product.store.isDemo ? <Badge tone="muted" label={t('demoNotice')} /> : null}
          <View style={[ui.between, { alignItems: 'flex-start' }]}>
            <AppText variant="title" accessibilityRole="header" style={{ flex: 1 }}>
              {title}
            </AppText>
            <FavoriteButton productId={product.id} slug={product.slug} />
          </View>
          {variant ? (
            <View style={{ gap: 2 }}>
              <Price value={variant.priceTiyin} />
              {variant.compareAtPriceTiyin ? (
                <Price value={variant.compareAtPriceTiyin} old />
              ) : null}
            </View>
          ) : null}
          <AppText variant="small" color={max > 0 ? 'success' : 'destructive'}>
            {max === 0 ? t('outOfStock') : max <= 5 ? t('fewLeft', { count: max }) : t('inStock')}
          </AppText>

          {groups.map((group) => (
            <View key={group.attribute} style={{ gap: spacing.sm }}>
              <AppText variant="small" color="foreground" style={{ fontWeight: '600' }}>
                {localized(group.name, locale)}
              </AppText>
              <View style={styles.options}>
                {group.values.map((value) => {
                  const active = current[group.attribute] === value.code;
                  return (
                    <Pressable
                      key={value.code}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active }}
                      onPress={() => {
                        setSelection(
                          choose(product.variants, current, group.attribute, value.code),
                        );
                        setQuantity(1);
                        setAdded(false);
                      }}
                      style={[
                        styles.option,
                        {
                          borderColor: active ? c.primary : c.border,
                          backgroundColor: active ? c.secondary : c.card,
                        },
                      ]}
                    >
                      <AppText variant="small" color="foreground">
                        {localized(value.name, locale)}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}

          {max > 0 ? (
            <View style={{ gap: spacing.md }}>
              <Stepper value={quantity} max={max} onChange={setQuantity} />
              <Button
                title={t('addToCart')}
                icon="bag-add-outline"
                loading={pending}
                onPress={() => void add()}
              />
            </View>
          ) : null}
          {error ? (
            <AppText color="destructive" accessibilityLiveRegion="polite">
              {error}
            </AppText>
          ) : null}
          {added ? (
            <Card style={{ borderColor: c.accent }}>
              <AppText
                color="success"
                accessibilityLiveRegion="polite"
                style={{ fontWeight: '700' }}
              >
                {t('added')}
              </AppText>
              <Button
                title={t('goToCart')}
                variant="secondary"
                onPress={() => {
                  router.navigate('/cart');
                }}
              />
            </Card>
          ) : null}

          <AppText variant="muted">{t('payOnDelivery')}</AppText>
          <AppText variant="small">
            {t('seller', { name: localized(product.store.name, locale) })}
          </AppText>

          {product.attributes.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              <AppText variant="heading">{t('specs')}</AppText>
              {product.attributes.map((a) => (
                <View key={`${a.attribute}-${a.code}`} style={ui.between}>
                  <AppText variant="muted">{localized(a.attributeName, locale)}</AppText>
                  <AppText>{localized(a.name, locale)}</AppText>
                </View>
              ))}
            </View>
          ) : null}
          <View style={{ gap: spacing.sm }}>
            <AppText variant="heading">{t('description')}</AppText>
            <AppText>{localized(product.description, locale)}</AppText>
          </View>
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  noImage: {
    height: WIDTH * 0.75,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
