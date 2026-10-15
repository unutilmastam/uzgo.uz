import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Divider } from '@/components/ui';
import { radius, spacing, useColors } from '@/lib/theme';
import { useApp } from '@/state/app';

export type SelectOption = { value: string; label: string; hint?: string };

/** A labelled field that opens a full-screen list to pick one option. */
export function SelectField({
  label,
  value,
  options,
  onChange,
  disabled,
  error,
}: {
  label: string;
  value: string | null;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string | null;
}) {
  const { t } = useApp();
  const c = useColors();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="small" color="foreground" style={{ fontWeight: '600' }}>
        {label}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? t('select')}`}
        accessibilityState={{ disabled: disabled === true, expanded: open }}
        disabled={disabled}
        onPress={() => {
          setOpen(true);
        }}
        style={[
          styles.field,
          {
            borderColor: error ? c.destructive : c.input,
            backgroundColor: c.card,
            opacity: disabled ? 0.55 : 1,
          },
        ]}
      >
        <AppText
          style={{ flex: 1 }}
          color={selected ? 'foreground' : 'mutedForeground'}
          numberOfLines={1}
        >
          {selected?.label ?? t('select')}
        </AppText>
        <Ionicons name="chevron-down" size={18} color={c.mutedForeground} />
      </Pressable>
      {error ? (
        <AppText variant="small" color="destructive">
          {error}
        </AppText>
      ) : null}
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setOpen(false);
        }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
          <View style={styles.header}>
            <AppText variant="heading" style={{ flex: 1 }}>
              {label}
            </AppText>
            <Button
              title={t('close')}
              variant="ghost"
              onPress={() => {
                setOpen(false);
              }}
            />
          </View>
          <FlatList
            data={options}
            keyExtractor={(o) => o.value}
            ItemSeparatorComponent={Divider}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: item.value === value }}
                onPress={() => {
                  onChange(item.value);
                  setOpen(false);
                }}
                style={styles.option}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText>{item.label}</AppText>
                  {item.hint ? <AppText variant="small">{item.hint}</AppText> : null}
                </View>
                {item.value === value ? (
                  <Ionicons name="checkmark" size={20} color={c.primary} />
                ) : null}
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
});
