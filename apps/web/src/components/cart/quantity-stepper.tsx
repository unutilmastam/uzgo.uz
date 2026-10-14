'use client';

import { Minus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function QuantityStepper({
  value,
  max,
  onChange,
  label,
  disabled = false,
}: {
  value: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
  disabled?: boolean;
}) {
  const t = useTranslations('product');
  const button =
    'inline-flex size-10 items-center justify-center rounded-md hover:bg-muted disabled:pointer-events-none disabled:opacity-40';
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex items-center rounded-lg border border-border"
    >
      <button
        type="button"
        className={button}
        aria-label={t('decrease')}
        disabled={disabled || value <= 1}
        onClick={() => {
          onChange(value - 1);
        }}
      >
        <Minus aria-hidden="true" className="size-4" />
      </button>
      <output aria-live="polite" className="min-w-8 text-center font-semibold tabular-nums">
        {value}
      </output>
      <button
        type="button"
        className={button}
        aria-label={t('increase')}
        disabled={disabled || value >= max}
        onClick={() => {
          onChange(value + 1);
        }}
      >
        <Plus aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
