import Ionicons from '@expo/vector-icons/Ionicons';
import { categoryTreeResponseSchema } from '@uzgo/contracts';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CategoryIcon } from '@/components/category-icon';
import { ProductListView } from '@/components/product-list';
import { AppText } from '@/components/ui';
import { localized } from '@/lib/format';
import { radius, spacing, useColors } from '@/lib/theme';
import { useRequest } from '@/lib/use-request';
import { useApp } from '@/state/app';

function Header() {
  const { api, t, locale } = useApp();
  const c = useColors();
  const tree = useRequest(
    () => api.request('/catalog/categories', { schema: categoryTreeResponseSchema }),
    [],
  );
  return (
    <View style={{ gap: spacing.lg, marginBottom: spacing.sm }}>
      <View style={styles.brand}>
        <AppText variant="title" color="primary">
          UZ
          <AppText variant="title" color="brandGo">
            GO
          </AppText>
        </AppText>
      </View>
      <Pressable
        accessibilityRole="search"
        accessibilityLabel={t('searchPlaceholder')}
        onPress={() => {
          router.push('/search');
        }}
        style={[styles.search, { backgroundColor: c.muted, borderColor: c.border }]}
      >
        <Ionicons name="search" size={20} color={c.mutedForeground} />
        <AppText variant="muted">{t('searchPlaceholder')}</AppText>
      </Pressable>
      {tree.data && tree.data.items.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chips}>
            {tree.data.items.map((category) => (
              <Pressable
                key={category.id}
                onPress={() => {
                  router.push(`/category/${category.slug}`);
                }}
                accessibilityRole="link"
                style={[styles.chip, { backgroundColor: c.secondary }]}
              >
                <CategoryIcon icon={category.icon} size={18} color={c.secondaryForeground} />
                <AppText variant="small" color="secondaryForeground" style={styles.chipText}>
                  {localized(category.name, locale)}
                </AppText>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      ) : null}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={t('foodTitle')}
        onPress={() => {
          router.push('/food');
        }}
        style={[styles.food, { backgroundColor: c.secondary, borderColor: c.border }]}
        testID="food-entry"
      >
        <Ionicons name="restaurant" size={28} color={c.primary} />
        <View style={{ flex: 1 }}>
          <AppText variant="heading">{t('foodTitle')}</AppText>
          <AppText variant="small">{t('foodHomeText')}</AppText>
        </View>
        <Ionicons name="chevron-forward" size={20} color={c.mutedForeground} />
      </Pressable>
      <AppText variant="heading">{t('recommended')}</AppText>
    </View>
  );
}

export default function HomeScreen() {
  const c = useColors();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.background }}>
      <ProductListView query="sort=newest" header={<Header />} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  food: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  brand: { flexDirection: 'row', alignItems: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
  },
  chips: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipText: { fontWeight: '600' },
});
