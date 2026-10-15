import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { pushTarget } from './push-target';

/** A tapped notification opens its order or the store's shipments (once the app is ready). */
export function useNotificationTaps(ready: boolean): void {
  const lastTap = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!ready || !lastTap) return;
    const target = pushTarget(lastTap.notification.request.content.data);
    if (target) router.push(target);
  }, [ready, lastTap]);
}
