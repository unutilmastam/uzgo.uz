'use client';

import type { ProductStatus } from '@uzgo/contracts';
import { Button } from '@uzgo/ui/components/button';
import { toast } from '@uzgo/ui/components/toast';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useErrorMessage } from '@/components/panel/use-error-message';
import { useRouter } from '@/i18n/navigation';
import { apiClient } from '@/lib/api-client';

/** Submit for review, archive or restore. The server enforces every rule again. */
export function ProductActions({
  storeId,
  productId,
  status,
  readOnly,
}: {
  storeId: string;
  productId: string;
  status: ProductStatus;
  readOnly: boolean;
}) {
  const t = useTranslations('seller');
  const errorMessage = useErrorMessage('seller');
  const router = useRouter();
  const [pending, setPending] = useState(false);
  if (readOnly) return null;

  async function run(action: 'submit' | 'archive' | 'restore') {
    setPending(true);
    try {
      await apiClient(`/seller/stores/${storeId}/products/${productId}/${action}`, {
        method: 'POST',
      });
      toast.success(action === 'submit' ? t('submitted') : t('saved'));
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === 'DRAFT' || status === 'REJECTED' ? (
        <Button disabled={pending} onClick={() => void run('submit')}>
          {t('submitForReview')}
        </Button>
      ) : null}
      {status === 'ARCHIVED' ? (
        <Button variant="outline" disabled={pending} onClick={() => void run('restore')}>
          {t('restore')}
        </Button>
      ) : (
        <Button variant="outline" disabled={pending} onClick={() => void run('archive')}>
          {t('archive')}
        </Button>
      )}
    </div>
  );
}
