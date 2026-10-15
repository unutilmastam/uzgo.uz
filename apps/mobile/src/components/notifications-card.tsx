import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { AppText, Button, Card } from '@/components/ui';
import { type PushState, pushPermission, registerForPush } from '@/lib/push';
import { useApp } from '@/state/app';

/** Order notifications on this phone: shows the state and asks only on a tap. */
export function NotificationsCard() {
  const { api, t, errorText } = useApp();
  const [state, setState] = useState<PushState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    pushPermission().then(
      (s) => {
        if (active) setState(s);
      },
      () => {
        if (active) setState('unavailable');
      },
    );
    return () => {
      active = false;
    };
  }, []);

  if (state === null || state === 'unavailable') return null;

  return (
    <Card>
      <AppText variant="heading">{t('notifications')}</AppText>
      <AppText variant="muted">
        {state === 'denied' ? t('notificationsOff') : t('notificationsOn')}
      </AppText>
      {state === 'undetermined' ? (
        <Button
          title={t('enableNotifications')}
          icon="notifications-outline"
          variant="secondary"
          onPress={() => {
            registerForPush(api, true).then(setState, (err: unknown) => {
              setError(errorText(err));
            });
          }}
        />
      ) : null}
      {state === 'denied' ? (
        <Button
          title={t('openSettings')}
          variant="outline"
          onPress={() => void Linking.openSettings()}
        />
      ) : null}
      {error ? (
        <AppText variant="small" color="destructive">
          {error}
        </AppText>
      ) : null}
    </Card>
  );
}
