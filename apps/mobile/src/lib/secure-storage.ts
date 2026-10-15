import * as SecureStore from 'expo-secure-store';
import type { TokenKey, TokenStorage } from './api';

/** Session and guest-cart tokens live in the OS keystore (Keychain / Keystore). */
const KEYS: Record<TokenKey, string> = { session: 'uzgo.session', cart: 'uzgo.cart' };

export const secureTokenStorage: TokenStorage = {
  get: (key) => SecureStore.getItemAsync(KEYS[key]),
  set: (key, value) => SecureStore.setItemAsync(KEYS[key], value),
  remove: (key) => SecureStore.deleteItemAsync(KEYS[key]),
};

/** Non-secret preferences (chosen language). */
export const preferences = {
  getLocale: () => SecureStore.getItemAsync('uzgo.locale'),
  setLocale: (locale: string) => SecureStore.setItemAsync('uzgo.locale', locale),
};
