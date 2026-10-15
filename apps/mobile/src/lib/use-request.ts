import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ApiError } from './api';

export type RequestState<T> = {
  data: T | undefined;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
};

const toApiError = (err: unknown) =>
  err instanceof ApiError ? err : new ApiError(0, 'CLIENT_ERROR');

/**
 * Loads data for a screen. `deps` (JSON-serialisable) re-run it; `reload()`
 * re-runs it on demand (pull to refresh, retry). The previous data stays
 * visible while a reload is in flight. Errors are ApiError.
 */
export function useRequest<T>(load: () => Promise<T>, deps: readonly unknown[]): RequestState<T> {
  const [nonce, setNonce] = useState(0);
  const key = `${JSON.stringify(deps)}#${String(nonce)}`;
  const [result, setResult] = useState<{ key: string; data?: T; error: ApiError | null }>({
    key: '',
    error: null,
  });
  const loadRef = useRef(load);
  useLayoutEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let active = true;
    loadRef.current().then(
      (data) => {
        if (active) setResult({ key, data, error: null });
      },
      (err: unknown) => {
        if (active) setResult((prev) => ({ key, data: prev.data, error: toApiError(err) }));
      },
    );
    return () => {
      active = false;
    };
  }, [key]);

  const reload = useCallback(() => {
    setNonce((n) => n + 1);
  }, []);

  return {
    data: result.data,
    error: result.key === key ? result.error : null,
    loading: result.key !== key,
    reload,
  };
}
