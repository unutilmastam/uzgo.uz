'use client';

import { favoriteIdsResponseSchema } from '@uzgo/contracts';
import { Button } from '@uzgo/ui/components/button';
import { toast } from '@uzgo/ui/components/toast';
import { Heart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { ApiClientError, apiClient } from '@/lib/api-client';

/** Save / unsave a product. Guests are sent to login and come back here. */
export function FavoriteButton({ productId, slug }: { productId: string; slug: string }) {
  const t = useTranslations('favorites');
  const router = useRouter();
  const [saved, setSaved] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    apiClient('/favorites/ids').then(
      (body) => {
        if (active) setSaved(favoriteIdsResponseSchema.parse(body).productIds.includes(productId));
      },
      () => {
        // Guest or offline: the button still works (login on click).
        if (active) setSaved(false);
      },
    );
    return () => {
      active = false;
    };
  }, [productId]);

  async function toggle() {
    const next = !saved;
    setPending(true);
    setSaved(next);
    try {
      await apiClient(`/favorites/${productId}`, { method: next ? 'PUT' : 'DELETE' });
      toast.success(next ? t('added') : t('removed'));
    } catch (err) {
      setSaved(!next);
      if (err instanceof ApiClientError && err.status === 401) {
        router.push({ pathname: '/login', query: { next: `/p/${slug}` } });
        return;
      }
      toast.error(
        err instanceof ApiClientError && err.code === 'FAVORITES_LIMIT'
          ? t('error_FAVORITES_LIMIT')
          : t('error_generic'),
      );
    } finally {
      setPending(false);
    }
  }

  const label = saved ? t('remove') : t('add');
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={label}
      aria-pressed={saved === true}
      title={label}
      disabled={pending || saved === null}
      onClick={() => void toggle()}
      data-testid="favorite-button"
    >
      <Heart aria-hidden="true" className={saved ? 'size-5 fill-sale text-sale' : 'size-5'} />
    </Button>
  );
}
