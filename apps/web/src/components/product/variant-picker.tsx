'use client';

import type { Variant } from '@uzgo/contracts';
import { Badge } from '@uzgo/ui/components/badge';
import { Price } from '@uzgo/ui/components/price';
import { discountPercent } from '@uzgo/ui/lib/money';
import { cn } from '@uzgo/ui/lib/cn';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useMemo, useState } from 'react';
import type { Locale } from '@/i18n/routing';

type Group = {
  code: string;
  name: { uz: string; ru: string };
  values: { code: string; name: { uz: string; ru: string } }[];
};

function groupsOf(variants: Variant[]): Group[] {
  const groups = new Map<string, Group>();
  for (const variant of variants) {
    for (const option of variant.options) {
      const group = groups.get(option.attribute) ?? {
        code: option.attribute,
        name: option.attributeName,
        values: [],
      };
      if (!group.values.some((v) => v.code === option.code))
        group.values.push({ code: option.code, name: option.name });
      groups.set(option.attribute, group);
    }
  }
  return [...groups.values()];
}

const optionsOf = (variant: Variant) => new Map(variant.options.map((o) => [o.attribute, o.code]));

/**
 * Variant selection: choosing a value switches to the variant that keeps as
 * many of the other selected options as possible (preferring in-stock ones).
 * `children` receives the selected variant (e.g. the add-to-cart form).
 */
export function VariantPicker({
  variants,
  children,
}: {
  variants: Variant[];
  children?: (variant: Variant) => ReactNode;
}) {
  const t = useTranslations('product');
  const locale = useLocale() as Locale;
  const groups = useMemo(() => groupsOf(variants), [variants]);
  const [selectedId, setSelectedId] = useState(
    () => (variants.find((v) => v.available > 0) ?? variants[0])?.id,
  );
  const selected = variants.find((v) => v.id === selectedId) ?? variants[0];
  if (!selected) return null;
  const current = optionsOf(selected);

  function choose(attribute: string, value: string) {
    const scored = variants
      .filter((v) => optionsOf(v).get(attribute) === value)
      .map((v) => {
        const options = optionsOf(v);
        let score = v.available > 0 ? 100 : 0;
        for (const [code, val] of current) if (options.get(code) === val) score++;
        return { v, score };
      })
      .sort((a, b) => b.score - a.score);
    if (scored[0]) setSelectedId(scored[0].v.id);
  }

  const discount = selected.compareAtPriceTiyin
    ? discountPercent(selected.compareAtPriceTiyin, selected.priceTiyin)
    : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1" aria-live="polite">
        <Price value={selected.priceTiyin} locale={locale} className="text-3xl font-bold" />
        {discount > 0 && selected.compareAtPriceTiyin ? (
          <>
            <span className="text-muted-foreground line-through">
              <span className="sr-only">{t('oldPrice')} </span>
              <Price value={selected.compareAtPriceTiyin} locale={locale} className="font-normal" />
            </span>
            <Badge variant="sale">{t('discount', { percent: discount })}</Badge>
          </>
        ) : null}
      </div>
      <p
        className={cn(
          'text-sm font-medium',
          selected.available === 0
            ? 'text-destructive'
            : selected.available <= 5
              ? 'text-warning'
              : 'text-success',
        )}
        data-testid="availability"
      >
        {selected.available === 0
          ? t('outOfStock')
          : selected.available <= 5
            ? t('fewLeft', { count: selected.available })
            : t('inStock')}
      </p>
      {groups.map((group) => (
        <fieldset key={group.code}>
          <legend className="mb-2 text-sm font-semibold">{group.name[locale]}</legend>
          <div className="flex flex-wrap gap-2">
            {group.values.map((value) => {
              const active = current.get(group.code) === value.code;
              return (
                <button
                  key={value.code}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    choose(group.code, value.code);
                  }}
                  className={cn(
                    'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-4 text-sm font-medium transition-colors',
                    active
                      ? 'border-primary bg-secondary text-secondary-foreground'
                      : 'border-border hover:bg-muted',
                  )}
                >
                  {value.name[locale]}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
      {children?.(selected)}
    </div>
  );
}
