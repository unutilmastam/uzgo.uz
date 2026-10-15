import type { TokenKey, TokenStorage } from './api';

/**
 * Web build of the app = automated preview tests only (docs/MOBILE.md); there
 * is no keystore in a browser, so tokens live for the tab's session only.
 */
const key = (k: string) => `uzgo.${k}`;

export const secureTokenStorage: TokenStorage = {
  get: (k: TokenKey) => Promise.resolve(sessionStorage.getItem(key(k))),
  set: (k: TokenKey, value: string) => {
    sessionStorage.setItem(key(k), value);
    return Promise.resolve();
  },
  remove: (k: TokenKey) => {
    sessionStorage.removeItem(key(k));
    return Promise.resolve();
  },
};

export const preferences = {
  getLocale: () => Promise.resolve(sessionStorage.getItem(key('locale'))),
  setLocale: (locale: string) => {
    sessionStorage.setItem(key('locale'), locale);
    return Promise.resolve();
  },
};
