'use client';

import {
  type MyReview,
  myReviewResponseSchema,
  type ProductReviews,
  productReviewsResponseSchema,
  REVIEW_TEXT_MAX,
  type Review,
} from '@uzgo/contracts';
import { Button } from '@uzgo/ui/components/button';
import { toast } from '@uzgo/ui/components/toast';
import { cn } from '@uzgo/ui/lib/cn';
import { Star } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
import { FormError, Textarea } from '@/components/panel/form-controls';
import { Link } from '@/i18n/navigation';
import { ApiClientError, apiClient } from '@/lib/api-client';
import { Stars } from './stars';

function useErrorText() {
  const t = useTranslations('reviews');
  return (err: unknown) => {
    if (err instanceof ApiClientError) {
      if (err.code === 'REVIEW_NOT_ALLOWED') return t('error_REVIEW_NOT_ALLOWED');
      if (err.code === 'VALIDATION_FAILED') return t('error_VALIDATION_FAILED');
      if (err.status === 429) return t('error_RATE_LIMITED');
    }
    return t('error_generic');
  };
}

function ReviewItem({ review }: { review: Review }) {
  const t = useTranslations('reviews');
  const format = useFormatter();
  return (
    <li className="flex flex-col gap-1.5 py-4" data-testid="review">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Stars value={review.rating} label={t('stars', { count: review.rating })} />
        <span className="font-medium">{review.authorName ?? t('anonymous')}</span>
        <time dateTime={review.createdAt} className="text-muted-foreground">
          {format.dateTime(new Date(review.createdAt), {
            dateStyle: 'medium',
            timeZone: 'Asia/Tashkent',
          })}
        </time>
      </div>
      {review.text ? <p className="whitespace-pre-line text-sm">{review.text}</p> : null}
    </li>
  );
}

/** Published reviews: the first page comes from the server, more load on demand. */
export function ReviewList({ slug, initial }: { slug: string; initial: ProductReviews }) {
  const t = useTranslations('reviews');
  const [items, setItems] = useState(initial.items);
  const [page, setPage] = useState(initial.page);
  const [pending, setPending] = useState(false);
  const errorText = useErrorText();
  const hasMore = page * initial.pageSize < initial.total;

  async function more() {
    setPending(true);
    try {
      const next = productReviewsResponseSchema.parse(
        await apiClient(`/catalog/products/${encodeURIComponent(slug)}/reviews?page=${page + 1}`),
      );
      setItems((current) => [
        ...current,
        ...next.items.filter((r) => !current.some((c) => c.id === r.id)),
      ]);
      setPage(next.page);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setPending(false);
    }
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('empty')}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <ul className="divide-y divide-border">
        {items.map((review) => (
          <ReviewItem key={review.id} review={review} />
        ))}
      </ul>
      {hasMore ? (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={pending}
          onClick={() => void more()}
        >
          {t('showMore')}
        </Button>
      ) : null}
    </div>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const t = useTranslations('reviews');
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-sm font-medium">{t('yourRating')}</legend>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            className="cursor-pointer rounded-md p-1 has-focus-visible:ring-2 has-focus-visible:ring-ring"
          >
            <input
              type="radio"
              name={name}
              value={n}
              checked={value === n}
              onChange={() => {
                onChange(n);
              }}
              className="sr-only"
            />
            <span className="sr-only">{t('stars', { count: n })}</span>
            <Star
              aria-hidden="true"
              className={cn(
                'size-8',
                n <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/50',
              )}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * The visitor's own review. Only customers whose shipment with this product
 * was delivered may write one (checked again by the server).
 */
export function ReviewForm({ slug }: { slug: string }) {
  const t = useTranslations('reviews');
  const errorText = useErrorText();
  const id = useId();
  const path = `/products/${encodeURIComponent(slug)}/reviews/mine`;
  const [state, setState] = useState<MyReview | 'guest' | null>(null);
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiClient(path).then(
      (body) => {
        if (active) setState(myReviewResponseSchema.parse(body));
      },
      (err: unknown) => {
        if (!active) return;
        if (err instanceof ApiClientError && err.status === 401) setState('guest');
        else setState({ canReview: false, review: null });
      },
    );
    return () => {
      active = false;
    };
  }, [path]);

  if (state === null) return null;
  if (state === 'guest') {
    return (
      <p className="text-sm text-muted-foreground">
        <Link href={{ pathname: '/login', query: { next: `/p/${slug}` } }} className="underline">
          {t('signIn')}
        </Link>{' '}
        {t('signInHint')}
      </p>
    );
  }

  function startEdit(current: MyReview) {
    setRating(current.review?.rating ?? 0);
    setText(current.review?.text ?? '');
    setError(null);
    setEditing(true);
  }

  async function save() {
    if (rating < 1) {
      setError(t('chooseRating'));
      return;
    }
    setPending(true);
    setError(null);
    try {
      const body = myReviewResponseSchema.parse(
        await apiClient(path, {
          method: 'PUT',
          body: { rating, ...(text.trim() ? { text: text.trim() } : {}) },
        }),
      );
      setState(body);
      setEditing(false);
      toast.success(t('saved'));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!window.confirm(t('deleteConfirm'))) return;
    setPending(true);
    try {
      await apiClient(path, { method: 'DELETE' });
      setState((s) => (s && s !== 'guest' ? { ...s, review: null } : s));
      toast.success(t('deleted'));
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setPending(false);
    }
  }

  const mine = state.review;
  if (editing) {
    return (
      <form
        className="flex flex-col gap-3 rounded-xl border border-border p-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        data-testid="review-form"
      >
        <StarPicker value={rating} onChange={setRating} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-text`} className="text-sm font-medium">
            {t('textLabel')}
          </label>
          <Textarea
            id={`${id}-text`}
            value={text}
            maxLength={REVIEW_TEXT_MAX}
            onChange={(event) => {
              setText(event.target.value);
            }}
            aria-describedby={`${id}-hint ${id}-error`}
          />
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {t('textHint', { max: REVIEW_TEXT_MAX })}
          </p>
        </div>
        <FormError id={`${id}-error`} message={error} />
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {t('submit')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setEditing(false);
            }}
          >
            {t('cancel')}
          </Button>
        </div>
      </form>
    );
  }

  if (mine) {
    return (
      <div
        className="flex flex-col gap-2 rounded-xl border border-border p-4"
        data-testid="my-review"
      >
        <p className="text-sm font-medium">{t('yourReview')}</p>
        <Stars value={mine.rating} label={t('stars', { count: mine.rating })} />
        {mine.text ? <p className="whitespace-pre-line text-sm">{mine.text}</p> : null}
        {mine.hidden ? <p className="text-xs text-destructive">{t('hiddenNotice')}</p> : null}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              startEdit(state);
            }}
          >
            {t('edit')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => void remove()}
          >
            {t('delete')}
          </Button>
        </div>
      </div>
    );
  }

  if (!state.canReview) {
    return <p className="text-sm text-muted-foreground">{t('onlyBuyers')}</p>;
  }
  return (
    <Button
      type="button"
      className="self-start"
      onClick={() => {
        startEdit(state);
      }}
    >
      {t('write')}
    </Button>
  );
}
