'use client';

import { Button } from '@uzgo/ui/components/button';
import { EmptyState } from '@uzgo/ui/components/empty-state';
import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('states');
  return (
    <EmptyState
      tone="error"
      icon={<TriangleAlert />}
      title={t('errorTitle')}
      description={t('errorDescription')}
      action={<Button onClick={reset}>{t('retry')}</Button>}
    />
  );
}
