import type { ProductSort } from '@uzgo/contracts';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { ProductListView } from '@/components/product-list';
import { SortBar } from '@/components/sort-bar';
import { EmptyState, Field } from '@/components/ui';
import { spacing, useColors } from '@/lib/theme';
import { useApp } from '@/state/app';

export default function SearchScreen() {
  const { t } = useApp();
  const c = useColors();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ProductSort>('relevance');
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen options={{ title: t('search') }} />
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <Field
          label={t('searchPlaceholder')}
          value={text}
          onChangeText={setText}
          autoFocus
          returnKeyType="search"
          autoCorrect={false}
          maxLength={100}
          onSubmitEditing={() => {
            setQuery(text.trim());
          }}
        />
      </View>
      {query.length > 0 ? (
        <ProductListView
          query={`q=${encodeURIComponent(query)}&sort=${sort}`}
          header={
            <SortBar
              value={sort}
              onChange={setSort}
              options={['relevance', 'newest', 'price_asc', 'price_desc']}
            />
          }
        />
      ) : (
        <EmptyState icon="search-outline" title={t('searchPlaceholder')} />
      )}
    </View>
  );
}
