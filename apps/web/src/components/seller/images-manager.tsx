'use client';

import { PRODUCT_IMAGE_LIMITS, type SellerProduct } from '@uzgo/contracts';
import { Button } from '@uzgo/ui/components/button';
import { toast } from '@uzgo/ui/components/toast';
import { ImagePlus, Star, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';
import { FormError } from '@/components/panel/form-controls';
import { useErrorMessage } from '@/components/panel/use-error-message';
import { useRouter } from '@/i18n/navigation';
import { apiClient } from '@/lib/api-client';

/** Upload, remove and choose the main image. The server re-encodes every upload. */
export function ImagesManager({
  storeId,
  product,
  readOnly,
}: {
  storeId: string;
  product: SellerProduct;
  readOnly: boolean;
}) {
  const t = useTranslations('seller');
  const errorMessage = useErrorMessage('seller');
  const router = useRouter();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/seller/stores/${storeId}/products/${product.id}/images`;
  const full = product.images.length >= PRODUCT_IMAGE_LIMITS.maxImages;

  async function run(action: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  function upload(file: File) {
    // Same limit as the server; the server still checks the real content.
    if (file.size > PRODUCT_IMAGE_LIMITS.maxBytes) {
      setError(t('error_FILE_TOO_LARGE'));
      return;
    }
    const data = new FormData();
    data.append('file', file);
    void run(() => apiClient(base, { method: 'POST', formData: data }));
  }

  function makeMain(imageId: string) {
    const ids = [imageId, ...product.images.map((i) => i.id).filter((i) => i !== imageId)];
    void run(() => apiClient(`${base}/order`, { method: 'PUT', body: { ids } }));
  }

  return (
    <div className="flex flex-col gap-3">
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">
        {t('imagesHint', { max: PRODUCT_IMAGE_LIMITS.maxImages })}
      </p>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {product.images.map((image, index) => (
          <li
            key={image.id}
            className="relative overflow-hidden rounded-lg border border-border bg-muted"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- seller preview of an API-served image */}
            <img
              src={image.url}
              alt={t('imageAlt', { index: index + 1 })}
              className="aspect-square w-full object-contain"
              loading="lazy"
            />
            {readOnly ? null : (
              <div className="absolute inset-x-1 bottom-1 flex justify-end gap-1">
                {index > 0 ? (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="secondary"
                    disabled={pending}
                    aria-label={t('makeMain')}
                    onClick={() => {
                      makeMain(image.id);
                    }}
                  >
                    <Star aria-hidden="true" />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="icon-sm"
                  variant="secondary"
                  disabled={pending}
                  aria-label={t('removeImage')}
                  onClick={() => {
                    void run(() => apiClient(`${base}/${image.id}`, { method: 'DELETE' }));
                  }}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {readOnly || full ? null : (
        <div>
          <input
            ref={input}
            id={`${id}-file`}
            type="file"
            accept={PRODUCT_IMAGE_LIMITS.types.join(',')}
            className="sr-only"
            aria-describedby={`${id}-hint`}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) upload(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => input.current?.click()}
          >
            <ImagePlus aria-hidden="true" />
            {pending ? t('uploading') : t('upload')}
          </Button>
        </div>
      )}
      <FormError id={`${id}-error`} message={error} />
    </div>
  );
}
