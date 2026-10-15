import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { ApiClient } from './api';

// Show order notifications while the app is open, too.
Notifications.setNotificationHandler({
  handleNotification: () =>
    Promise.resolve({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
});

export type PushState = 'granted' | 'denied' | 'undetermined' | 'unavailable';

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId;
}

function toState(status: Notifications.PermissionStatus): PushState {
  if (status === Notifications.PermissionStatus.GRANTED) return 'granted';
  if (status === Notifications.PermissionStatus.DENIED) return 'denied';
  return 'undetermined';
}

export async function pushPermission(): Promise<PushState> {
  if (!Device.isDevice || !projectId()) return 'unavailable';
  const { status } = await Notifications.getPermissionsAsync();
  return toState(status);
}

/**
 * Registers this phone for order notifications (ADR 0022). Asks for permission
 * only when `ask` is set (a user action); otherwise registers silently if the
 * permission was already given. The device is bound to the current session.
 */
export async function registerForPush(api: ApiClient, ask: boolean): Promise<PushState> {
  if (!Device.isDevice) return 'unavailable';
  const id = projectId();
  if (!id) return 'unavailable';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('orders', {
      name: 'Orders',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (toState(status) !== 'granted' && ask) {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  const state = toState(status);
  if (state !== 'granted') return state;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
  await api.request('/push-devices', {
    method: 'PUT',
    body: { token, platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID' },
  });
  return 'granted';
}
