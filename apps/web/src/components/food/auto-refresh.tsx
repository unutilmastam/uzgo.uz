'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';

/** Re-renders the server page every `seconds` while the page is visible. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, seconds * 1000);
    return () => {
      clearInterval(timer);
    };
  }, [router, seconds]);
  return null;
}
