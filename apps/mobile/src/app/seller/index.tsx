import Ionicons from '@expo/vector-icons/Ionicons';
import { sellerStoresResponseSchema } from '@uzgo/contracts';
import { router, Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, View } from 'react-native';
import {
  AppText,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Loading,
  Screen,
  styles as ui,
} from '@/components/ui';
import { WEB_URL } from '@/lib/config';
import { localized } from '@/lib/format';
import { useColors } from '@/lib/theme';
import { useRequest } from '@/lib/use-request';
import { useApp } from '@/state/app';

/** The stores the user works in. Product editing stays in the web panel. */
export default function SellerStoresScreen() {
  const { api, t, locale } = useApp();
  const c = useColors();
  const stores = useRequest(
    () => api.request('/seller/stores', { schema: sellerStoresResponseSchema }),
    [],
  );
  const webPanel = {
    title: t('openWebPanel'),
    onPress: () => void WebBrowser.openBrowserAsync(`${WEB_URL}/${locale}/seller`),
  };
  if (stores.error && !stores.data)
    return <ErrorState error={stores.error} onRetry={stores.reload} />;
  if (!stores.data) return <Loading />;
  return (
    <Screen>
      <Stack.Screen options={{ title: t('myStores') }} />
      {stores.data.items.length === 0 ? (
        <EmptyState icon="storefront-outline" title={t('noStores')} action={webPanel} />
      ) : (
        stores.data.items.map((store) => (
          <Pressable
            key={store.id}
            onPress={() => {
              router.push({ pathname: '/seller/[storeId]', params: { storeId: store.id } });
            }}
            accessibilityRole="link"
          >
            <Card>
              <View style={ui.between}>
                <AppText variant="heading" style={{ flex: 1 }}>
                  {localized(store.name, locale)}
                </AppText>
                <Ionicons name="chevron-forward" size={18} color={c.mutedForeground} />
              </View>
              <Badge
                label={t(`storeStatus_${store.status}`)}
                tone={store.status === 'ACTIVE' ? 'accent' : 'muted'}
              />
            </Card>
          </Pressable>
        ))
      )}
      {stores.data.items.length > 0 ? (
        <AppText
          variant="small"
          color="primary"
          onPress={webPanel.onPress}
          accessibilityRole="link"
        >
          {webPanel.title}
        </AppText>
      ) : null}
    </Screen>
  );
}
