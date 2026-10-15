import {
  type CartView,
  cartResponseSchema,
  type CurrentUser,
  currentUserResponseSchema,
} from '@uzgo/contracts';
import { getLocales } from 'expo-localization';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ApiError, createApiClient, type ApiClient } from '@/lib/api';
import { API_URL } from '@/lib/config';
import { type Locale, localeFromDevice, translate } from '@/lib/i18n';
import { preferences, secureTokenStorage } from '@/lib/secure-storage';

type Params = Record<string, string | number>;

type AppState = {
  ready: boolean;
  api: ApiClient;
  user: CurrentUser | null;
  locale: Locale;
  t: (key: string, params?: Params) => string;
  /** Message for an API error code (falls back to a generic text). */
  errorText: (error: unknown) => string;
  setLocale: (locale: Locale) => Promise<void>;
  signIn: (token: string, user: CurrentUser) => Promise<void>;
  signOut: (everywhere?: boolean) => Promise<void>;
  refreshUser: () => Promise<void>;
  cart: CartView | null;
  setCart: (cart: CartView) => void;
  refreshCart: () => Promise<void>;
};

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [locale, setLocaleState] = useState<Locale>(() =>
    localeFromDevice(getLocales().at(0)?.languageCode),
  );
  const [cart, setCart] = useState<CartView | null>(null);

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: API_URL,
        storage: secureTokenStorage,
        onUnauthorized: () => {
          setUser(null);
        },
      }),
    [],
  );

  const t = useCallback((key: string, params?: Params) => translate(locale, key, params), [locale]);
  const errorText = useCallback(
    (error: unknown) => {
      const code = error instanceof ApiError ? error.code : 'generic';
      const text = translate(locale, `error_${code}`);
      return text === `error_${code}` ? translate(locale, 'error_generic') : text;
    },
    [locale],
  );

  const refreshCart = useCallback(async () => {
    try {
      setCart((await api.request('/cart', { schema: cartResponseSchema })).cart);
    } catch {
      // The badge is optional; screens show their own errors.
    }
  }, [api]);

  const refreshUser = useCallback(async () => {
    if (!(await secureTokenStorage.get('session'))) {
      setUser(null);
      return;
    }
    try {
      setUser((await api.request('/auth/me', { schema: currentUserResponseSchema })).user);
    } catch (err) {
      // Offline: keep the session and try again later; 401 already cleared it.
      if (err instanceof ApiError && err.status === 401) setUser(null);
    }
  }, [api]);

  useEffect(() => {
    void (async () => {
      const saved = await preferences.getLocale();
      if (saved === 'uz' || saved === 'ru') setLocaleState(saved);
      await refreshUser();
      await refreshCart();
      setReady(true);
    })();
  }, [refreshUser, refreshCart]);

  const setLocale = useCallback(async (next: Locale) => {
    setLocaleState(next);
    await preferences.setLocale(next);
  }, []);

  const signIn = useCallback(
    async (token: string, next: CurrentUser) => {
      await secureTokenStorage.set('session', token);
      // The guest cart was merged into the account by the API.
      await secureTokenStorage.remove('cart');
      setUser(next);
      await refreshCart();
    },
    [refreshCart],
  );

  const signOut = useCallback(
    async (everywhere = false) => {
      try {
        await api.request(everywhere ? '/auth/logout-all' : '/auth/logout', { method: 'POST' });
      } catch {
        // Logging out locally must work offline too.
      }
      await secureTokenStorage.remove('session');
      setUser(null);
      setCart(null);
      await refreshCart();
    },
    [api, refreshCart],
  );

  const value = useMemo<AppState>(
    () => ({
      ready,
      api,
      user,
      locale,
      t,
      errorText,
      setLocale,
      signIn,
      signOut,
      refreshUser,
      cart,
      setCart,
      refreshCart,
    }),
    [
      ready,
      api,
      user,
      locale,
      t,
      errorText,
      setLocale,
      signIn,
      signOut,
      refreshUser,
      cart,
      refreshCart,
    ],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const state = useContext(AppContext);
  if (!state) throw new Error('useApp must be used inside <AppProvider>');
  return state;
}
