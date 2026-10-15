import type { ProductSort } from '@uzgo/contracts';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui';
import { radius, spacing, useColors } from '@/lib/theme';
import { useApp } from '@/state/app';

export function SortBar({
  value,
  onChange,
  options = ['newest', 'price_asc', 'price_desc'],
}: {
  value: ProductSort;
  onChange: (sort: ProductSort) => void;
  options?: ProductSort[];
}) {
  const { t } = useApp();
  const c = useColors();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel={t('sort')}>
      <View style={styles.row}>
        {options.map((option) => {
          const active = option === value;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              onPress={() => {
                onChange(option);
              }}
              style={[
                styles.pill,
                {
                  backgroundColor: active ? c.primary : c.card,
                  borderColor: active ? c.primary : c.border,
                },
              ]}
            >
              <AppText
                variant="small"
                color={active ? 'primaryForeground' : 'foreground'}
                style={{ fontWeight: '600' }}
              >
                {t(`sort_${option}`)}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, paddingBottom: spacing.sm },
  pill: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
