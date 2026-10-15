import { favoritesResponseSchema } from '@uzgo/contracts';
import { Redirect, router, Stack, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, RefreshControl } from 'react-native';
import { ProductCard } from '@/components/product-card';
import { EmptyState, ErrorState, Loading } from '@/components/ui';
import { spacing, useColors } from '@/lib/theme';
import { useRequest } from '@/lib/use-request';
import { useApp } from '@/state/app';

export default function FavoritesScreen() {
  const { api, t, user } = useApp();
  const c = useColors();
  const favorites = useRequest(
    () =>
      user
        ? api.request('/favorites', { schema: favoritesResponseSchema })
        : Promise.resolve({ items: [] }),
    [user?.id],
  );
  useFocusEffect(
    useCallback(() => {
      favorites.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- reload is stable
    }, []),
  );
  if (!user) return <Redirect href={{ pathname: '/login', params: { next: '/favorites' } }} />;
  if (favorites.error && !favorites.data) {
    return <ErrorState error={favorites.error} onRetry={favorites.reload} />;
  }
  if (!favorites.data) return <Loading />;
  return (
    <>
      <Stack.Screen options={{ title: t('favorites') }} />
      <FlatList
        data={favorites.data.items}
        keyExtractor={(p) => p.id}
        numColumns={2}
        style={{ backgroundColor: c.background }}
        columnWrapperStyle={{ gap: spacing.md }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={favorites.reload} />}
        renderItem={({ item }) => <ProductCard product={item} />}
        ListEmptyComponent={
          <EmptyState
            icon="heart-outline"
            title={t('favoritesEmpty')}
            text={t('favoritesEmptyHint')}
            action={{
              title: t('startShopping'),
              onPress: () => {
                router.navigate('/catalog');
              },
            }}
          />
        }
      />
    </>
  );
}
