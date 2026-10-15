import { Badge } from '@uzgo/ui/components/badge';
import { EmptyState } from '@uzgo/ui/components/empty-state';
import { Pagination } from '@uzgo/ui/components/pagination';
import { MessageSquareText } from 'lucide-react';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { AdminAction } from '@/components/admin/admin-action';
import { StatusFilter } from '@/components/panel/status-filter';
import { Stars } from '@/components/product/stars';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { getAdminReviews } from '@/lib/admin-api';
import { requireStaff } from '../../staff';

const FILTERS = ['ALL', 'LOW', 'HIDDEN'] as const;
type Filter = (typeof FILTERS)[number];

/** Review moderation: newest first; "low" shows 1–2 star reviews, which most need a look. */
export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  await requireStaff('/admin/reviews');
  const query = await searchParams;
  const filter: Filter = FILTERS.includes(query.filter as Filter)
    ? (query.filter as Filter)
    : 'ALL';
  const page = Math.max(Number.parseInt(query.page ?? '1', 10) || 1, 1);
  const [t, locale, format, list] = await Promise.all([
    getTranslations(),
    getLocale() as Promise<Locale>,
    getFormatter(),
    getAdminReviews(
      filter === 'HIDDEN' ? 'HIDDEN' : undefined,
      filter === 'LOW' ? 2 : undefined,
      page,
    ),
  ]);
  const href = (f: Filter, p = 1) =>
    `/admin/reviews?${new URLSearchParams({ filter: f, ...(p > 1 ? { page: String(p) } : {}) }).toString()}`;

  return (
    <div className="flex flex-col gap-4">
      <StatusFilter
        label={t('admin.tabReviews')}
        current={filter}
        options={FILTERS.map((f) => ({ value: f, label: t(`admin.reviews_${f}`), href: href(f) }))}
      />
      {!list || list.items.length === 0 ? (
        <EmptyState icon={<MessageSquareText />} title={t('admin.empty')} />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {list.items.map((review) => (
            <li key={review.id} className="flex flex-col gap-2 p-4" data-testid="admin-review">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <Stars value={review.rating} label={t('reviews.stars', { count: review.rating })} />
                <Link href={`/p/${review.product.slug}`} className="font-medium hover:underline">
                  {review.product.title[locale]}
                </Link>
                {review.status === 'HIDDEN' ? (
                  <Badge variant="muted">{t('admin.reviewHidden')}</Badge>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {[
                  review.authorName ?? t('reviews.anonymous'),
                  review.authorPhone,
                  format.dateTime(new Date(review.createdAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: 'Asia/Tashkent',
                  }),
                ].join(' · ')}
              </p>
              {review.text ? <p className="whitespace-pre-line text-sm">{review.text}</p> : null}
              {review.moderationNote ? (
                <p className="text-xs text-muted-foreground">
                  {t('admin.reviewNote', { note: review.moderationNote })}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {review.status === 'PUBLISHED' ? (
                  <AdminAction
                    path={`/admin/reviews/${review.id}/hide`}
                    label={t('admin.reviewHide')}
                    withReason
                    field="note"
                    fieldLabel={t('admin.reviewHideReason')}
                    variant="destructive"
                  />
                ) : (
                  <AdminAction
                    path={`/admin/reviews/${review.id}/publish`}
                    label={t('admin.reviewPublish')}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {list ? (
        <Pagination
          page={list.page}
          pageCount={Math.ceil(list.total / list.pageSize)}
          linkAs={Link}
          hrefFor={(p) => href(filter, p)}
          labels={{
            nav: t('pagination.nav'),
            previous: t('pagination.previous'),
            next: t('pagination.next'),
            page: (p) => t('pagination.page', { page: p }),
          }}
        />
      ) : null}
    </div>
  );
}
