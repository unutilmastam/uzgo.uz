import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import type { IconName } from '@/components/ui';
import { useColors } from '@/lib/theme';
import { useApp } from '@/state/app';

function icon(name: IconName, focusedName: IconName) {
  return ({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) => (
    <Ionicons name={focused ? focusedName : name} color={color} size={size} />
  );
}

export default function TabsLayout() {
  const { t, cart } = useApp();
  const c = useColors();
  const count = cart?.itemCount ?? 0;
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.mutedForeground,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
        headerStyle: { backgroundColor: c.background },
        headerTintColor: c.foreground,
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabHome'),
          headerShown: false,
          tabBarIcon: icon('home-outline', 'home'),
        }}
      />
      <Tabs.Screen
        name="catalog"
        options={{ title: t('tabCatalog'), tabBarIcon: icon('grid-outline', 'grid') }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: t('tabCart'),
          tabBarIcon: icon('bag-outline', 'bag'),
          tabBarBadge: count > 0 ? count : undefined,
          tabBarBadgeStyle: { backgroundColor: c.accent, color: c.accentForeground },
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{ title: t('tabOrders'), tabBarIcon: icon('receipt-outline', 'receipt') }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: t('tabAccount'), tabBarIcon: icon('person-outline', 'person') }}
      />
    </Tabs>
  );
}
