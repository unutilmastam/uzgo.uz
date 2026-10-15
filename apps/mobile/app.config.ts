import type { ExpoConfig } from 'expo/config';

/**
 * UZGO mobile app (ADR 0022). The API origin is baked in at build time from
 * EXPO_PUBLIC_API_URL (the production domain is still to be chosen, ADR 0020).
 */
export default (): ExpoConfig => ({
  name: 'UZGO',
  slug: 'uzgo',
  scheme: 'uzgo',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  ios: {
    bundleIdentifier: 'uz.uzgo.app',
    supportsTablet: true,
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: 'uz.uzgo.app',
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#143c8f' },
    // The app needs network and notifications only.
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
    ],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-localization',
    'expo-web-browser',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 160,
        backgroundColor: '#143c8f',
        dark: { image: './assets/splash-icon.png', backgroundColor: '#0c1018' },
      },
    ],
    ['expo-notifications', { icon: './assets/notification-icon.png', color: '#143c8f' }],
  ],
  extra: {
    eas: process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : undefined,
  },
});
