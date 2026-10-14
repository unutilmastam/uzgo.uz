import { ImageOff } from 'lucide-react';
import type { ElementType, ReactNode } from 'react';
import { cn } from '../lib/cn';
import { discountPercent, type MoneyLocale, type Tiyin } from '../lib/money';
import { Badge } from './badge';
import { Price } from './price';

export type ProductCardProps = {
  title: string;
  price: Tiyin;
  oldPrice?: Tiyin;
  locale: MoneyLocale;
  storeName?: string;
  /** Image element (e.g. next/image). A neutral placeholder is shown when absent. */
  image?: ReactNode;
  /** Extra badges shown over the image (e.g. "Demo"). */
  badges?: ReactNode;
  /** Action area, e.g. an add-to-cart button. */
  action?: ReactNode;
  href?: string;
  linkAs?: ElementType;
  labels: { oldPrice: string; discount: (percent: number) => string };
  className?: string;
};

export function ProductCard({
  title,
  price,
  oldPrice,
  locale,
  storeName,
  image,
  badges,
  action,
  href,
  linkAs: Link = 'a',
  labels,
  className,
}: ProductCardProps) {
  const discount = oldPrice === undefined ? 0 : discountPercent(oldPrice, price);

  return (
    <article
      className={cn(
        'group relative flex flex-col gap-2 rounded-xl border border-border bg-card p-2 text-card-foreground shadow-sm transition-shadow duration-(--duration-base) hover:shadow-md motion-reduce:transition-none',
        className,
      )}
    >
      <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
        {image ?? (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ImageOff aria-hidden="true" className="size-8" />
          </div>
        )}
        <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
          {discount > 0 ? <Badge variant="sale">{labels.discount(discount)}</Badge> : null}
          {badges}
        </div>
      </div>
      <div className="flex flex-col gap-0.5 px-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <Price value={price} locale={locale} className="text-lg text-foreground" />
          {discount > 0 && oldPrice !== undefined ? (
            <span className="text-sm text-muted-foreground line-through">
              <span className="sr-only">{labels.oldPrice} </span>
              <Price value={oldPrice} locale={locale} className="font-normal" />
            </span>
          ) : null}
        </div>
        <h3 className="line-clamp-2 text-sm leading-snug">
          {href ? (
            <Link href={href} className="after:absolute after:inset-0 hover:text-primary">
              {title}
            </Link>
          ) : (
            title
          )}
        </h3>
        {storeName ? <p className="truncate text-xs text-muted-foreground">{storeName}</p> : null}
      </div>
      {action ? <div className="relative z-10 mt-auto px-1 pb-1">{action}</div> : null}
    </article>
  );
}
