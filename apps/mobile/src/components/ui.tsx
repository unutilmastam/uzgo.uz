import Ionicons from '@expo/vector-icons/Ionicons';
import { formatPrice, type Tiyin } from '@uzgo/ui/lib/money';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type Colors, radius, spacing, useColors } from '@/lib/theme';
import { useApp } from '@/state/app';

export type IconName = ComponentProps<typeof Ionicons>['name'];

type TextVariant = 'title' | 'heading' | 'body' | 'muted' | 'small' | 'price';

const TEXT: Record<TextVariant, TextStyle> = {
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  heading: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22 },
  muted: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 13, lineHeight: 18 },
  price: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
};

export function AppText({
  variant = 'body',
  color,
  style,
  children,
  ...props
}: ComponentProps<typeof Text> & { variant?: TextVariant; color?: keyof Colors }) {
  const c = useColors();
  const tone =
    color ?? (variant === 'muted' || variant === 'small' ? 'mutedForeground' : 'foreground');
  return (
    <Text style={[TEXT[variant], { color: c[tone] }, style]} {...props}>
      {children}
    </Text>
  );
}

/** Screen container: safe area, background, optional scrolling and refresh. */
export function Screen({
  children,
  scroll = true,
  padded = true,
  refreshControl,
  edges = ['bottom'],
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  refreshControl?: ComponentProps<typeof ScrollView>['refreshControl'];
  edges?: ComponentProps<typeof SafeAreaView>['edges'];
}) {
  const c = useColors();
  const inner: ViewStyle = { padding: padded ? spacing.lg : 0, gap: spacing.lg };
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: c.background }}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={inner}
          keyboardShouldPersistTaps="handled"
          {...(refreshControl ? { refreshControl } : {})}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'destructive' | 'ghost';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  accessibilityLabel,
  testID,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const c = useColors();
  const palette: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: c.primary, fg: c.primaryForeground, border: c.primary },
    secondary: { bg: c.secondary, fg: c.secondaryForeground, border: c.secondary },
    outline: { bg: 'transparent', fg: c.foreground, border: c.border },
    destructive: { bg: c.destructive, fg: c.destructiveForeground, border: c.destructive },
    ghost: { bg: 'transparent', fg: c.primary, border: 'transparent' },
  };
  const p = palette[variant];
  const inactive = disabled === true || loading === true;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: inactive, busy: loading === true }}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: p.bg,
          borderColor: p.border,
          opacity: inactive ? 0.55 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={18} color={p.fg} /> : null}
          <Text style={[styles.buttonText, { color: p.fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  error,
  hint,
  ...input
}: TextInputProps & { label: string; error?: string | null; hint?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="small" color="foreground" style={{ fontWeight: '600' }}>
        {label}
      </AppText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.mutedForeground}
        style={[
          styles.input,
          {
            color: c.foreground,
            backgroundColor: c.card,
            borderColor: error ? c.destructive : c.input,
          },
        ]}
        {...input}
      />
      {error ? (
        <AppText variant="small" color="destructive" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="small">{hint}</AppText>
      ) : null}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const c = useColors();
  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }, style]}>
      {children}
    </View>
  );
}

export function Price({ value, old }: { value: Tiyin; old?: boolean }) {
  const { locale } = useApp();
  const c = useColors();
  if (old) {
    return (
      <Text style={[TEXT.small, { color: c.mutedForeground, textDecorationLine: 'line-through' }]}>
        {formatPrice(value, locale)}
      </Text>
    );
  }
  return <AppText variant="price">{formatPrice(value, locale)}</AppText>;
}

export function Badge({
  label,
  tone = 'secondary',
}: {
  label: string;
  tone?: 'secondary' | 'accent' | 'sale' | 'muted';
}) {
  const c = useColors();
  const map = {
    secondary: { bg: c.secondary, fg: c.secondaryForeground },
    accent: { bg: c.accent, fg: c.accentForeground },
    sale: { bg: c.sale, fg: c.saleForeground },
    muted: { bg: c.muted, fg: c.mutedForeground },
  } as const;
  return (
    <View style={[styles.badge, { backgroundColor: map[tone].bg }]}>
      <Text style={{ color: map[tone].fg, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export function Loading() {
  const c = useColors();
  const { t } = useApp();
  return (
    <View style={styles.center} accessibilityLabel={t('loading')}>
      <ActivityIndicator size="large" color={c.primary} />
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: IconName;
  title: string;
  text?: string;
  action?: { title: string; onPress: () => void };
}) {
  const c = useColors();
  return (
    <View style={[styles.center, { gap: spacing.md, paddingVertical: spacing.xxl }]}>
      <View style={[styles.emptyIcon, { backgroundColor: c.secondary }]}>
        <Ionicons name={icon} size={32} color={c.primary} />
      </View>
      <AppText variant="heading" style={{ textAlign: 'center' }}>
        {title}
      </AppText>
      {text ? (
        <AppText variant="muted" style={{ textAlign: 'center' }}>
          {text}
        </AppText>
      ) : null}
      {action ? <Button title={action.title} onPress={action.onPress} /> : null}
    </View>
  );
}

/** Error with a retry button (network or server problems). */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t, errorText } = useApp();
  return (
    <EmptyState
      icon="cloud-offline-outline"
      title={errorText(error)}
      action={{ title: t('retry'), onPress: onRetry }}
    />
  );
}

export function Divider() {
  const c = useColors();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />;
}

/** Label – value row for summaries. */
export function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: ReactNode;
  strong?: boolean;
}) {
  return (
    <View style={styles.between}>
      <AppText variant={strong ? 'heading' : 'muted'}>{label}</AppText>
      {typeof value === 'string' ? (
        <AppText variant={strong ? 'heading' : 'body'}>{value}</AppText>
      ) : (
        value
      )}
    </View>
  );
}

/** Selectable option (radio-like) for checkout choices. */
export function Choice({
  label,
  hint,
  selected,
  onPress,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[
        styles.choice,
        {
          borderColor: selected ? c.primary : c.border,
          backgroundColor: selected ? c.secondary : c.card,
        },
      ]}
    >
      <Ionicons
        name={selected ? 'radio-button-on' : 'radio-button-off'}
        size={20}
        color={selected ? c.primary : c.mutedForeground}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText>{label}</AppText>
        {hint ? <AppText variant="small">{hint}</AppText> : null}
      </View>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '700' },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
  },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
});
