import Ionicons from '@expo/vector-icons/Ionicons';
import type { ProductSummary } from '@uzgo/contracts';
import { discountPercent } from '@uzgo/ui/lib/money';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Stars } from '@/components/reviews';
import { AppText, Badge, Price, styles as ui } from '@/components/ui';
import { mediaUrl } from '@/lib/config';
import { localized } from '@/lib/format';
import { radius, spacing, useColors } from '@/lib/theme';
import { useApp } from '@/state/app';

export function ProductCard({ product }: { product: ProductSummary }) {
  const { locale, t } = useApp();
  const c = useColors();
  const title = localized(product.title, locale);
  const image = mediaUrl(product.image?.url);
  const percent = product.compareAtPriceTiyin
    ? discountPercent(product.compareAtPriceTiyin, product.priceTiyin)
    : 0;
  return (
    <Pressable
      onPress={() => {
        router.push(`/product/${product.slug}`);
      }}
      accessibilityRole="link"
      accessibilityLabel={title}
      style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
    >
      <View style={[styles.image, { backgroundColor: c.muted }]}>
        {image ? (
          <Image
            source={image}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <Ionicons name="image-outline" size={32} color={c.mutedForeground} />
        )}
        {percent > 0 ? (
          <View style={styles.badge}>
            <Badge tone="sale" label={`−${String(percent)}%`} />
          </View>
        ) : null}
      </View>
      <View style={{ padding: spacing.sm, gap: 2 }}>
        <Price value={product.priceTiyin} />
        {product.compareAtPriceTiyin ? <Price value={product.compareAtPriceTiyin} old /> : null}
        <AppText variant="small" color="foreground" numberOfLines={2}>
          {title}
        </AppText>
        {product.rating ? (
          <View style={ui.row}>
            <Stars
              value={product.rating.average}
              size={12}
              label={t('ratingLabel', { average: product.rating.average })}
            />
            <AppText variant="small">{`(${String(product.rating.count)})`}</AppText>
          </View>
        ) : null}
        <AppText variant="small" numberOfLines={1}>
          {localized(product.store.name, locale)}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  image: { aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: spacing.sm, left: spacing.sm },
});
