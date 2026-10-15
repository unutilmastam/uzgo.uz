import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { registerForPush } from '@/lib/push';
import { useNotificationTaps } from '@/lib/notification-taps';
import { useColors } from '@/lib/theme';
import { AppProvider, useApp } from '@/state/app';

void SplashScreen.preventAutoHideAsync();

function Navigation() {
  const { ready, t, user, api } = useApp();
  const c = useColors();
  const userId = user?.id;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  // Already allowed on this phone → keep it registered for the current session.
  useEffect(() => {
    if (userId) registerForPush(api, false).catch(() => undefined);
  }, [api, userId]);

  useNotificationTaps(ready);
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.background },
          headerTintColor: c.foreground,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: c.background },
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: t('tabHome') }} />
        <Stack.Screen name="login" options={{ presentation: 'modal', title: t('login') }} />
        <Stack.Screen name="checkout" options={{ title: t('checkoutTitle') }} />
        <Stack.Screen name="search" options={{ title: t('search') }} />
        <Stack.Screen name="seller/index" options={{ title: t('myStores') }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <Navigation />
      </AppProvider>
    </SafeAreaProvider>
  );
}
