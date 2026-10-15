import Ionicons from '@expo/vector-icons/Ionicons';
import {
  type MyReview,
  myReviewResponseSchema,
  productReviewsResponseSchema,
  REVIEW_TEXT_MAX,
  type Review,
} from '@uzgo/contracts';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppText, Button, Card, Divider, Field, styles as ui } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { confirmAction, notify } from '@/lib/dialogs';
import { formatDate } from '@/lib/format';
import { spacing, useColors } from '@/lib/theme';
import { useApp } from '@/state/app';

const STAR = '#f59e0b';

/** Read-only star row with one accessible label. */
export function Stars({
  value,
  size = 14,
  label,
}: {
  value: number;
  size?: number;
  label: string;
}) {
  const c = useColors();
  const filled = Math.round(value);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={ui.row}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons
          key={n}
          name={n <= filled ? 'star' : 'star-outline'}
          size={size}
          color={n <= filled ? STAR : c.mutedForeground}
        />
      ))}
    </View>
  );
}

function ReviewRow({ review }: { review: Review }) {
  const { t, locale } = useApp();
  return (
    <View style={{ gap: spacing.xs, paddingVertical: spacing.sm }} testID="review">
      <View style={[ui.row, { flexWrap: 'wrap' }]}>
        <Stars value={review.rating} label={t('starsLabel', { count: review.rating })} />
        <AppText variant="small" color="foreground" style={{ fontWeight: '600' }}>
          {review.authorName ?? t('reviewAnonymous')}
        </AppText>
        <AppText variant="small">{formatDate(review.createdAt, locale)}</AppText>
      </View>
      {review.text ? <AppText>{review.text}</AppText> : null}
    </View>
  );
}

/** The customer's own review: write, edit or delete (server checks the purchase). */
function MyReviewBox({ slug, onChanged }: { slug: string; onChanged: () => void }) {
  const { api, t, user, errorText } = useApp();
  const c = useColors();
  const path = `/products/${encodeURIComponent(slug)}/reviews/mine`;
  const [state, setState] = useState<MyReview | null>(null);
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    api.request(path, { schema: myReviewResponseSchema }).then(
      (res) => {
        if (active) setState(res);
      },
      () => {
        if (active) setState({ canReview: false, review: null });
      },
    );
    return () => {
      active = false;
    };
  }, [api, user, path]);

  if (!user) {
    return (
      <Button
        variant="outline"
        title={t('reviewSignIn')}
        onPress={() => {
          router.push({ pathname: '/login', params: { next: `/product/${slug}` } });
        }}
      />
    );
  }
  if (!state) return null;

  function start(current: MyReview) {
    setRating(current.review?.rating ?? 0);
    setText(current.review?.text ?? '');
    setError(null);
    setEditing(true);
  }

  async function save() {
    if (rating < 1) {
      setError(t('reviewChooseRating'));
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await api.request(path, {
        method: 'PUT',
        body: { rating, ...(text.trim() ? { text: text.trim() } : {}) },
        schema: myReviewResponseSchema,
      });
      setState(res);
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429 ? t('error_RATE_LIMITED') : errorText(err),
      );
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!(await confirmAction(t('reviewDeleteConfirm'), t('reviewDelete'), t('cancel'), true)))
      return;
    setPending(true);
    try {
      await api.request(path, { method: 'DELETE' });
      setState((s) => (s ? { ...s, review: null } : s));
      onChanged();
    } catch (err) {
      notify(errorText(err));
    } finally {
      setPending(false);
    }
  }

  if (editing) {
    return (
      <Card>
        <AppText variant="small" color="foreground" style={{ fontWeight: '600' }}>
          {t('reviewYourRating')}
        </AppText>
        <View style={ui.row} accessibilityRole="radiogroup">
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable
              key={n}
              accessibilityRole="radio"
              accessibilityState={{ checked: rating === n }}
              accessibilityLabel={t('starsLabel', { count: n })}
              onPress={() => {
                setRating(n);
              }}
              hitSlop={6}
              testID={`star-${String(n)}`}
            >
              <Ionicons
                name={n <= rating ? 'star' : 'star-outline'}
                size={34}
                color={n <= rating ? STAR : c.mutedForeground}
              />
            </Pressable>
          ))}
        </View>
        <Field
          label={t('reviewText')}
          value={text}
          onChangeText={setText}
          maxLength={REVIEW_TEXT_MAX}
          multiline
          hint={t('reviewTextHint', { max: REVIEW_TEXT_MAX })}
        />
        {error ? (
          <AppText variant="small" color="destructive" accessibilityLiveRegion="polite">
            {error}
          </AppText>
        ) : null}
        <Button title={t('reviewSubmit')} loading={pending} onPress={() => void save()} />
        <Button
          variant="ghost"
          title={t('cancel')}
          onPress={() => {
            setEditing(false);
          }}
        />
      </Card>
    );
  }

  const mine = state.review;
  if (mine) {
    return (
      <Card>
        <AppText variant="small" color="foreground" style={{ fontWeight: '600' }}>
          {t('reviewYours')}
        </AppText>
        <Stars value={mine.rating} size={18} label={t('starsLabel', { count: mine.rating })} />
        {mine.text ? <AppText>{mine.text}</AppText> : null}
        {mine.hidden ? (
          <AppText variant="small" color="destructive">
            {t('reviewHidden')}
          </AppText>
        ) : null}
        <View style={ui.row}>
          <Button
            variant="outline"
            title={t('reviewEdit')}
            onPress={() => {
              start(state);
            }}
          />
          <Button
            variant="ghost"
            title={t('reviewDelete')}
            disabled={pending}
            onPress={() => void remove()}
          />
        </View>
      </Card>
    );
  }
  if (!state.canReview) return <AppText variant="small">{t('reviewOnlyBuyers')}</AppText>;
  return (
    <Button
      title={t('reviewWrite')}
      icon="create-outline"
      onPress={() => {
        start(state);
      }}
    />
  );
}

/** Rating summary, the customer's own review and published reviews (paged). */
export function ProductReviews({
  slug,
  rating,
  onChanged,
}: {
  slug: string;
  rating: { average: number; count: number } | null;
  onChanged: () => void;
}) {
  const { api, t } = useApp();
  const [items, setItems] = useState<Review[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .request(`/catalog/products/${encodeURIComponent(slug)}/reviews`, {
        schema: productReviewsResponseSchema,
        // After the customer's own change the list must not come from the cache.
        fresh: version > 0,
      })
      .then(
        (res) => {
          if (!active) return;
          setItems(res.items);
          setPage(res.page);
          setTotal(res.total);
        },
        () => undefined,
      );
    return () => {
      active = false;
    };
  }, [api, slug, version]);

  async function more() {
    setLoading(true);
    try {
      const res = await api.request(
        `/catalog/products/${encodeURIComponent(slug)}/reviews?page=${String(page + 1)}`,
        { schema: productReviewsResponseSchema },
      );
      setItems((current) => [
        ...current,
        ...res.items.filter((r) => !current.some((x) => x.id === r.id)),
      ]);
      setPage(res.page);
      setTotal(res.total);
    } catch {
      // The button stays; the customer can try again.
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ gap: spacing.md }}>
      <AppText variant="heading" accessibilityRole="header">
        {t('reviews')}
      </AppText>
      {rating ? (
        <View style={ui.row}>
          <AppText variant="title">{rating.average.toFixed(1)}</AppText>
          <View style={{ gap: 2 }}>
            <Stars
              value={rating.average}
              size={18}
              label={t('ratingLabel', { average: rating.average })}
            />
            <AppText variant="small">{t('reviewCount', { count: rating.count })}</AppText>
          </View>
        </View>
      ) : null}
      <MyReviewBox
        slug={slug}
        onChanged={() => {
          setVersion((v) => v + 1);
          onChanged();
        }}
      />
      {items.length === 0 ? (
        <AppText variant="muted">{t('reviewsEmpty')}</AppText>
      ) : (
        <View>
          {items.map((review, index) => (
            <View key={review.id}>
              {index > 0 ? <Divider /> : null}
              <ReviewRow review={review} />
            </View>
          ))}
        </View>
      )}
      {items.length < total ? (
        <Button
          variant="outline"
          title={t('reviewsMore')}
          loading={loading}
          onPress={() => void more()}
        />
      ) : null}
    </View>
  );
}
