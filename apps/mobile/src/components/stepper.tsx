import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, styles as ui } from '@/components/ui';
import { radius, useColors } from '@/lib/theme';
import { useApp } from '@/state/app';

/** Quantity − / + control (1…max). */
export function Stepper({
  value,
  min = 1,
  max,
  onChange,
}: {
  value: number;
  /** Lowest value (0 lets a basket line be removed). */
  min?: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const { t } = useApp();
  const c = useColors();
  const button = (icon: 'remove' | 'add', label: string, next: number, disabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        onChange(next);
      }}
      style={[styles.stepperButton, { borderColor: c.border, opacity: disabled ? 0.4 : 1 }]}
    >
      <Ionicons name={icon} size={20} color={c.foreground} />
    </Pressable>
  );
  return (
    <View style={ui.row} accessibilityLabel={t('quantity')}>
      {button('remove', t('decrease'), value - 1, value <= min)}
      <AppText style={styles.stepperValue} accessibilityLiveRegion="polite">
        {String(value)}
      </AppText>
      {button('add', t('increase'), value + 1, value >= max)}
    </View>
  );
}

const styles = StyleSheet.create({
  stepperButton: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: { minWidth: 32, textAlign: 'center', fontSize: 18, fontWeight: '700' },
});
