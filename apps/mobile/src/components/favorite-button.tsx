import Ionicons from '@expo/vector-icons/Ionicons';
import { favoriteIdsResponseSchema } from '@uzgo/contracts';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { notify } from '@/lib/dialogs';
import { radius, useColors } from '@/lib/theme';
import { useApp } from '@/state/app';

/** Save / unsave a product; guests go to login first. */
export function FavoriteButton({ productId, slug }: { productId: string; slug: string }) {
  const { api, t, user, errorText } = useApp();
  const c = useColors();
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    api.request('/favorites/ids', { schema: favoriteIdsResponseSchema }).then(
      (res) => {
        if (active) setSaved(res.productIds.includes(productId));
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [api, user, productId]);

  async function toggle() {
    if (!user) {
      router.push({ pathname: '/login', params: { next: `/product/${slug}` } });
      return;
    }
    const next = !saved;
    setSaved(next);
    setPending(true);
    try {
      await api.request(`/favorites/${productId}`, { method: next ? 'PUT' : 'DELETE' });
    } catch (err) {
      setSaved(!next);
      notify(errorText(err));
    } finally {
      setPending(false);
    }
  }

  const label = saved ? t('favoriteRemove') : t('favoriteAdd');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: saved, disabled: pending }}
      disabled={pending}
      onPress={() => void toggle()}
      style={[styles.button, { borderColor: c.border, backgroundColor: c.card }]}
    >
      <Ionicons
        name={saved ? 'heart' : 'heart-outline'}
        size={22}
        color={saved ? c.sale : c.foreground}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
