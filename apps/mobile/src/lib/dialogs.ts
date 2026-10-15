import { Alert, Platform } from 'react-native';

/** Native confirmation dialog (browser confirm in the web preview used by tests). */
export function confirmAction(
  title: string,
  confirmLabel: string,
  cancelLabel: string,
  destructive = false,
): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(title));
  return new Promise((resolve) => {
    Alert.alert(
      title,
      undefined,
      [
        {
          text: cancelLabel,
          style: 'cancel',
          onPress: () => {
            resolve(false);
          },
        },
        {
          text: confirmLabel,
          style: destructive ? 'destructive' : 'default',
          onPress: () => {
            resolve(true);
          },
        },
      ],
      {
        cancelable: true,
        onDismiss: () => {
          resolve(false);
        },
      },
    );
  });
}

export function notify(message: string): void {
  if (Platform.OS === 'web') window.alert(message);
  else Alert.alert(message);
}
