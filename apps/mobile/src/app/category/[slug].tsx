import { categoryDetailResponseSchema, type ProductSort } from '@uzgo/contracts';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ProductListView } from '@/components/product-list';
import { SortBar } from '@/components/sort-bar';
import { localized } from '@/lib/format';
import { useRequest } from '@/lib/use-request';
import { useApp } from '@/state/app';

export default function CategoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { api, locale } = useApp();
  const [sort, setSort] = useState<ProductSort>('newest');
  const detail = useRequest(
    () =>
      api.request(`/catalog/categories/${encodeURIComponent(slug)}`, {
        schema: categoryDetailResponseSchema,
      }),
    [slug],
  );
  const title = detail.data ? localized(detail.data.category.name, locale) : '';
  return (
    <>
      <Stack.Screen options={{ title }} />
      <ProductListView
        query={`category=${encodeURIComponent(slug)}&sort=${sort}`}
        header={<SortBar value={sort} onChange={setSort} />}
      />
    </>
  );
}
