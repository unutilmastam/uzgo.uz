'use client';

import { type CartLine, type CartView, cartResponseSchema } from '@uzgo/contracts';
import { Button } from '@uzgo/ui/components/button';
import { EmptyState } from '@uzgo/ui/components/empty-state';
import { Price } from '@uzgo/ui/components/price';
import { Skeleton } from '@uzgo/ui/components/skeleton';
import { toast } from '@uzgo/ui/components/toast';
import { cn } from '@uzgo/ui/lib/cn';
import { ShoppingCart, Store, Trash2, TriangleAlert } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { CategoryIcon } from '@/components/category-icon';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { ApiClientError, apiClient } from '@/lib/api-client';
import { emitCartChanged } from '@/lib/cart-events';
import { categoryTint } from '@/lib/category-style';
import { QuantityStepper } from './quantity-stepper';

export function CartScreen({ loggedIn }: { loggedIn: boolean }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const [cart, setCart] = useState<CartView | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const apply = useCallback((json: unknown) => {
    const next = cartResponseSchema.parse(json).cart;
    setCart(next);
    emitCartChanged(next);
  }, []);

  useEffect(() => {
    apiClient('/cart')
      .then(apply)
      .catch(() => {
        setFailed(true);
      });
  }, [apply]);

  async function mutate(line: CartLine, action: { quantity: number } | 'remove') {
    setBusy(line.variantId);
    try {
      apply(
        action === 'remove'
          ? await apiClient(`/cart/items/${line.variantId}`, { method: 'DELETE' })
          : await apiClient(`/cart/items/${line.variantId}`, { method: 'PATCH', body: action }),
      );
    } catch (err) {
      const code = err instanceof ApiClientError ? err.code : '';
      toast.error(
        code === 'INSUFFICIENT_STOCK'
          ? t('cart.error_INSUFFICIENT_STOCK')
          : t('auth.error_generic'),
      );
    } finally {
      setBusy(null);
    }
  }

  if (failed) {
    return (
      <EmptyState
        tone="error"
        icon={<TriangleAlert />}
        title={t('states.errorTitle')}
        description={t('states.errorDescription')}
      />
    );
  }
  if (!cart) {
    return (
      <div className="flex flex-col gap-3" role="status" aria-live="polite">
        <span className="sr-only">{t('states.loading')}</span>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (cart.groups.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingCart />}
        title={t('cart.emptyTitle')}
        description={t('cart.emptyDescription')}
        action={
          <Button asChild>
            <Link href="/catalog">{t('cart.cta')}</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="flex flex-col gap-4">
        {cart.groups.map((group) => (
          <section
            key={group.store.id}
            className="rounded-xl border border-border bg-card"
            aria-label={group.store.name[locale]}
          >
            <header className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
              <Store aria-hidden="true" className="size-4 text-muted-foreground" />
              <Link href={`/s/${group.store.slug}`} className="hover:underline">
                {t('cart.fromStore', { store: group.store.name[locale] })}
              </Link>
            </header>
            <ul className="divide-y divide-border">
              {group.lines.map((line) => {
                const title = line.title[locale];
                return (
                  <li
                    key={line.variantId}
                    className={cn('flex gap-3 p-4', line.status !== 'OK' && 'bg-destructive/5')}
                  >
                    <Link
                      href={`/p/${line.productSlug}`}
                      className={cn(
                        'flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg',
                        categoryTint(line.categoryIcon),
                      )}
                    >
                      {line.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- object storage URL
                        <img src={line.imageUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <CategoryIcon icon={line.categoryIcon} className="size-8" />
                      )}
                    </Link>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <Link
                        href={`/p/${line.productSlug}`}
                        className="line-clamp-2 text-sm font-medium hover:text-primary"
                      >
                        {title}
                      </Link>
                      {line.options.length > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          {line.options.map((o) => o[locale]).join(' · ')}
                        </p>
                      ) : null}
                      {line.status !== 'OK' ? (
                        <p className="text-xs font-medium text-destructive" role="alert">
                          {line.status === 'UNAVAILABLE'
                            ? t('cart.status_UNAVAILABLE')
                            : t('cart.status_INSUFFICIENT_STOCK', { available: line.available })}
                        </p>
                      ) : null}
                      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                        <QuantityStepper
                          value={line.quantity}
                          max={Math.max(line.quantity, Math.min(line.available, 99))}
                          label={t('cart.quantityLabel', { title })}
                          disabled={busy !== null || line.status === 'UNAVAILABLE'}
                          onChange={(quantity) => void mutate(line, { quantity })}
                        />
                        <div className="flex items-center gap-2">
                          <Price value={line.lineTotalTiyin} locale={locale} />
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('cart.removeLabel', { title })}
                            disabled={busy !== null}
                            onClick={() => void mutate(line, 'remove')}
                          >
                            <Trash2 aria-hidden="true" className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <aside className="h-fit rounded-xl border border-border bg-card p-5 lg:sticky lg:top-40">
        <h2 className="mb-4 text-lg font-semibold">{t('cart.summary')}</h2>
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t('cart.items', { count: cart.itemCount })}</dt>
            <dd>
              <Price value={cart.subtotalTiyin} locale={locale} className="font-normal" />
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{t('cart.delivery')}</dt>
            <dd className="text-right">{t('cart.deliveryAgreed')}</dd>
          </div>
          <div className="mt-2 flex justify-between border-t border-border pt-3 text-base">
            <dt className="font-semibold">{t('cart.total')}</dt>
            <dd data-testid="cart-total">
              <Price value={cart.totalTiyin} locale={locale} className="text-lg font-bold" />
            </dd>
          </div>
        </dl>
        {cart.hasIssues ? (
          <p className="mt-3 text-sm text-destructive">{t('cart.fixIssues')}</p>
        ) : null}
        {cart.itemCount > 0 && !cart.hasIssues ? (
          <Button asChild size="lg" variant="accent" className="mt-4 w-full">
            <Link
              href={loggedIn ? '/checkout' : { pathname: '/login', query: { next: '/checkout' } }}
            >
              {loggedIn ? t('cart.checkout') : t('cart.loginToCheckout')}
            </Link>
          </Button>
        ) : null}
        <p className="mt-3 text-xs text-muted-foreground">{t('product.payOnDelivery')}</p>
      </aside>
    </div>
  );
}
