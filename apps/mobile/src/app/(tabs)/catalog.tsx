import Ionicons from '@expo/vector-icons/Ionicons';
import { type CategoryNode, categoryTreeResponseSchema } from '@uzgo/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CategoryIcon } from '@/components/category-icon';
import { AppText, Divider, ErrorState, Loading, Screen } from '@/components/ui';
import { localized } from '@/lib/format';
import { spacing, useColors } from '@/lib/theme';
import { useRequest } from '@/lib/use-request';
import { useApp } from '@/state/app';

function CategoryRow({ node }: { node: CategoryNode }) {
  const { locale, t } = useApp();
  const c = useColors();
  const [open, setOpen] = useState(false);
  const name = localized(node.name, locale);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => {
          setOpen((v) => !v);
        }}
        style={styles.row}
      >
        <CategoryIcon icon={node.icon} color={c.primary} />
        <AppText style={{ flex: 1, fontWeight: '600' }}>{name}</AppText>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={c.mutedForeground} />
      </Pressable>
      {open ? (
        <View style={{ paddingLeft: spacing.xl + spacing.md }}>
          <Pressable
            onPress={() => {
              router.push(`/category/${node.slug}`);
            }}
            accessibilityRole="link"
            style={styles.child}
          >
            <AppText color="primary">{t('allProducts')}</AppText>
          </Pressable>
          {node.children.map((child) => (
            <Pressable
              key={child.id}
              onPress={() => {
                router.push(`/category/${child.slug}`);
              }}
              accessibilityRole="link"
              style={styles.child}
            >
              <AppText>{localized(child.name, locale)}</AppText>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Divider />
    </View>
  );
}

export default function CatalogScreen() {
  const { api } = useApp();
  const tree = useRequest(
    () => api.request('/catalog/categories', { schema: categoryTreeResponseSchema }),
    [],
  );
  if (tree.error) return <ErrorState error={tree.error} onRetry={tree.reload} />;
  if (!tree.data) return <Loading />;
  return (
    <Screen padded={false}>
      <View>
        {tree.data.items.map((node) => (
          <CategoryRow key={node.id} node={node} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 56,
  },
  child: { minHeight: 44, justifyContent: 'center' },
});
