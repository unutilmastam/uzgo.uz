import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';
import { formatPrice, type MoneyLocale, type Tiyin } from '../lib/money';

export type PriceProps = Omit<ComponentProps<'span'>, 'children'> & {
  value: Tiyin;
  locale: MoneyLocale;
};

export function Price({ value, locale, className, ...props }: PriceProps) {
  return (
    <span className={cn('font-semibold tabular-nums', className)} {...props}>
      {formatPrice(value, locale)}
    </span>
  );
}
