'use client';

import type { CategoryNode, SellerAttribute, SellerProduct } from '@uzgo/contracts';
import { sellerAttributesResponseSchema } from '@uzgo/contracts';
import { Button } from '@uzgo/ui/components/button';
import { Input } from '@uzgo/ui/components/input';
import { toast } from '@uzgo/ui/components/toast';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useState } from 'react';
import { Field, FormError, NativeSelect, Textarea } from '@/components/panel/form-controls';
import { useErrorMessage } from '@/components/panel/use-error-message';
import { useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { apiClient } from '@/lib/api-client';

/** Leaf categories with their full path, e.g. "Elektronika › Smartfonlar". */
export function leafCategories(tree: CategoryNode[], locale: Locale) {
  const out: { id: string; label: string }[] = [];
  const walk = (nodes: CategoryNode[], path: string[]) => {
    for (const node of nodes) {
      const next = [...path, node.name[locale]];
      if (node.children.length === 0) out.push({ id: node.id, label: next.join(' › ') });
      else walk(node.children, next);
    }
  };
  walk(tree, []);
  return out;
}

/** Loads the attributes a category allows (value ids come from the API). */
export function useCategoryAttributes(categoryId: string): SellerAttribute[] {
  const [attributes, setAttributes] = useState<SellerAttribute[]>([]);
  useEffect(() => {
    if (!categoryId) return;
    let cancelled = false;
    void apiClient(`/seller/categories/${categoryId}/attributes`)
      .then((json) => {
        if (!cancelled) setAttributes(sellerAttributesResponseSchema.parse(json).items);
      })
      .catch(() => {
        if (!cancelled) setAttributes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [categoryId]);
  return categoryId ? attributes : [];
}

/** Product content (create or edit). Prices and stock live on variants. */
export function ProductForm({
  storeId,
  categories,
  product,
}: {
  storeId: string;
  categories: CategoryNode[];
  product?: SellerProduct;
}) {
  const t = useTranslations('seller');
  const locale = useLocale() as Locale;
  const errorMessage = useErrorMessage('seller');
  const router = useRouter();
  const id = useId();
  const leaves = useMemo(() => leafCategories(categories, locale), [categories, locale]);

  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '');
  const [title, setTitle] = useState(product?.title ?? { uz: '', ru: '' });
  const [description, setDescription] = useState(product?.description ?? { uz: '', ru: '' });
  const [selected, setSelected] = useState<string[]>(product?.attributeValueIds ?? []);
  const attributes = useCategoryAttributes(categoryId);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const valueFor = (attribute: SellerAttribute) =>
    attribute.values.find((v) => selected.includes(v.id))?.id ?? '';
  const choose = (attribute: SellerAttribute, valueId: string) => {
    const others = selected.filter((v) => !attribute.values.some((a) => a.id === v));
    setSelected(valueId ? [...others, valueId] : others);
  };

  async function submit() {
    setPending(true);
    setError(null);
    // Only values of attributes the chosen category allows.
    const allowed = new Set(attributes.flatMap((a) => a.values.map((v) => v.id)));
    const body = {
      categoryId,
      title: { uz: title.uz.trim(), ru: title.ru.trim() },
      description: { uz: description.uz.trim(), ru: description.ru.trim() },
      attributeValueIds: selected.filter((v) => allowed.has(v)),
    };
    try {
      if (product) {
        await apiClient(`/seller/stores/${storeId}/products/${product.id}`, {
          method: 'PATCH',
          body,
        });
        toast.success(t('saved'));
        router.refresh();
      } else {
        const res = await apiClient<{ product: { id: string } }>(
          `/seller/stores/${storeId}/products`,
          { method: 'POST', body },
        );
        router.push(`/seller/${storeId}/products/${res.product.id}`);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Field id={`${id}-category`} label={t('category')} className="sm:col-span-2">
        <NativeSelect
          id={`${id}-category`}
          required
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
          }}
        >
          <option value="" disabled>
            {t('selectCategory')}
          </option>
          {leaves.map((leaf) => (
            <option key={leaf.id} value={leaf.id}>
              {leaf.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id={`${id}-title-uz`} label={t('titleUz')}>
        <Input
          id={`${id}-title-uz`}
          required
          maxLength={160}
          value={title.uz}
          onChange={(e) => {
            setTitle({ ...title, uz: e.target.value });
          }}
        />
      </Field>
      <Field id={`${id}-title-ru`} label={t('titleRu')}>
        <Input
          id={`${id}-title-ru`}
          required
          maxLength={160}
          value={title.ru}
          onChange={(e) => {
            setTitle({ ...title, ru: e.target.value });
          }}
        />
      </Field>
      <Field id={`${id}-desc-uz`} label={t('descriptionUz')}>
        <Textarea
          id={`${id}-desc-uz`}
          required
          maxLength={5000}
          value={description.uz}
          onChange={(e) => {
            setDescription({ ...description, uz: e.target.value });
          }}
        />
      </Field>
      <Field id={`${id}-desc-ru`} label={t('descriptionRu')}>
        <Textarea
          id={`${id}-desc-ru`}
          required
          maxLength={5000}
          value={description.ru}
          onChange={(e) => {
            setDescription({ ...description, ru: e.target.value });
          }}
        />
      </Field>
      {attributes.length > 0 ? (
        <fieldset className="grid gap-4 sm:col-span-2 sm:grid-cols-3">
          <legend className="mb-2 text-sm font-semibold">{t('attributes')}</legend>
          {attributes.map((attribute) => (
            <Field
              key={attribute.id}
              id={`${id}-attr-${attribute.code}`}
              label={attribute.name[locale]}
            >
              <NativeSelect
                id={`${id}-attr-${attribute.code}`}
                value={valueFor(attribute)}
                onChange={(e) => {
                  choose(attribute, e.target.value);
                }}
              >
                <option value="">{t('notSet')}</option>
                {attribute.values.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.name[locale]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          ))}
        </fieldset>
      ) : null}
      <div className="flex flex-col gap-3 sm:col-span-2">
        <FormError id={`${id}-error`} message={error} />
        {product?.status === 'APPROVED' ? (
          <p className="text-sm text-muted-foreground">{t('reviewWarning')}</p>
        ) : null}
        <Button type="submit" disabled={pending || !categoryId} className="w-fit">
          {product ? t('save') : t('create')}
        </Button>
      </div>
    </form>
  );
}
