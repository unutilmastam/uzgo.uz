'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { ApiClientError } from '@/lib/api-client';

/** Maps an API error code to a translated message in `namespace` (generic fallback). */
export function useErrorMessage(namespace: 'seller' | 'admin') {
  const t = useTranslations();
  return useCallback(
    (err: unknown): string => {
      if (err instanceof ApiClientError) {
        const key = `${namespace}.error_${err.code}`;
        if (t.has(key)) return t(key);
        if (err.status === 413 && t.has('seller.error_FILE_TOO_LARGE')) {
          return t('seller.error_FILE_TOO_LARGE');
        }
      }
      return t('auth.error_generic');
    },
    [t, namespace],
  );
}
