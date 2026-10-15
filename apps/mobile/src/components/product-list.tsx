import { type ProductList, productListResponseSchema } from '@uzgo/contracts';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { ProductCard } from '@/components/product-card';
import { Button, EmptyState, ErrorState, Loading } from '@/components/ui';
import { spacing, useColors } from '@/lib/theme';
import { useApp } from '@/state/app';

/**
 * Two-column product grid with "load more" pagination for any catalog query
 * (category, search, store). `query` is the API query string without page.
 */
export function ProductListView({
  query,
  header,
}: {
  query: string;
  header?: React.ReactElement | null;
}) {
  const { api, t } = useApp();
  const c = useColors();
  const [pages, setPages] = useState<ProductList[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);

  const loadPage = useCallback(
    (page: number) =>
      api.request(`/catalog/products?${query}&page=${String(page)}&pageSize=24`, {
        schema: productListResponseSchema,
      }),
    [api, query],
  );

  useEffect(() => {
    let active = true;
    loadPage(1).then(
      (first) => {
        if (active) {
          setPages([first]);
          setError(null);
        }
      },
      (err: unknown) => {
        if (active) setError(err);
      },
    );
    return () => {
      active = false;
    };
  }, [loadPage, version]);

  const items = pages.flatMap((p) => p.items);
  const last = pages.at(-1);
  const hasMore = last ? last.page * last.pageSize < last.total : false;

  async function more() {
    if (!last || loading) return;
    setLoading(true);
    try {
      const next = await loadPage(last.page + 1);
      setPages((prev) => [...prev, next]);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  if (error && pages.length === 0) {
    return (
      <ErrorState
        error={error}
        onRetry={() => {
          setError(null);
          setVersion((v) => v + 1);
        }}
      />
    );
  }
  if (!last) return <Loading />;

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      numColumns={2}
      style={{ backgroundColor: c.background }}
      columnWrapperStyle={{ gap: spacing.md }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
      ListHeaderComponent={header ?? null}
      renderItem={({ item }) => <ProductCard product={item} />}
      ListEmptyComponent={
        <EmptyState icon="search-outline" title={t('noResults')} text={t('noResultsHint')} />
      }
      ListFooterComponent={
        hasMore ? (
          <View style={{ paddingVertical: spacing.md }}>
            <Button
              title={t('loadMore')}
              variant="outline"
              loading={loading}
              onPress={() => void more()}
            />
          </View>
        ) : null
      }
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={() => {
            setVersion((v) => v + 1);
          }}
        />
      }
    />
  );
}
