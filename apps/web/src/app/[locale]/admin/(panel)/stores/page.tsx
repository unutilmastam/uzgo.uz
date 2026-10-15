import { STORE_STATUSES, type StoreStatus } from '@uzgo/contracts';
import { EmptyState } from '@uzgo/ui/components/empty-state';
import { Pagination } from '@uzgo/ui/components/pagination';
import { Store } from 'lucide-react';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { AdminAction } from '@/components/admin/admin-action';
import { StatusFilter } from '@/components/panel/status-filter';
import { StoreStatusBadge } from '@/components/seller/status-badges';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { getAdminStores } from '@/lib/admin-api';
import { formatPhone } from '@/lib/format-phone';
import { isAdmin, requireStaff } from '../../staff';

const SEPARATOR = ' · ';

export default async function AdminStoresPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const user = await requireStaff('/admin/stores');
  const query = await searchParams;
  const status = STORE_STATUSES.includes(query.status as StoreStatus)
    ? (query.status as StoreStatus)
    : undefined;
  const page = Math.max(Number.parseInt(query.page ?? '1', 10) || 1, 1);
  const [t, locale, format, list] = await Promise.all([
    getTranslations(),
    getLocale() as Promise<Locale>,
    getFormatter(),
    getAdminStores(status, page),
  ]);
  const href = (s: string | undefined, p = 1) =>
    `/admin/stores${s || p > 1 ? '?' : ''}${new URLSearchParams({
      ...(s ? { status: s } : {}),
      ...(p > 1 ? { page: String(p) } : {}),
    }).toString()}`;
  const admin = isAdmin(user);

  return (
    <div className="flex flex-col gap-4">
      <StatusFilter
        label={t('admin.tabStores')}
        current={status}
        options={[undefined, ...STORE_STATUSES].map((s) => ({
          value: s,
          label: s ? t(`seller.storeStatus_${s}`) : t('admin.all'),
          href: href(s),
        }))}
      />
      {!list || list.items.length === 0 ? (
        <EmptyState icon={<Store />} title={t('admin.empty')} />
      ) : (
        <ul className="flex flex-col gap-3">
          {list.items.map((store) => (
            <li
              key={store.id}
              className="rounded-xl border border-border bg-card p-5"
              data-testid="admin-store"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold">{store.name[locale]}</span>
                <span className="font-mono text-xs text-muted-foreground">{store.slug}</span>
                <StoreStatusBadge status={store.status} />
                {store.status === 'ACTIVE' ? (
                  <Link href={`/s/${store.slug}`} className="text-sm text-primary hover:underline">
                    {t('seller.viewInStore')}
                  </Link>
                ) : null}
              </div>
              <dl className="mb-3 grid gap-1 text-sm sm:grid-cols-2">
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">{t('admin.legal')}</dt>
                  <dd>
                    {[
                      store.legalType ? t(`seller.legal_${store.legalType}`) : null,
                      store.legalName,
                    ]
                      .filter(Boolean)
                      .join(SEPARATOR)}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">{t('admin.taxId')}</dt>
                  <dd className="tabular-nums">{store.taxId}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">{t('admin.contactPhone')}</dt>
                  <dd className="tabular-nums">
                    {store.contactPhone ? formatPhone(store.contactPhone) : null}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">{t('admin.district')}</dt>
                  <dd>{store.district?.name[locale]}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">{t('admin.owners')}</dt>
                  <dd className="tabular-nums">
                    {store.owners.map((o) => formatPhone(o.phone)).join(', ')}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dd className="text-muted-foreground">
                    {t('admin.createdAt', {
                      date: format.dateTime(new Date(store.createdAt), { dateStyle: 'medium' }),
                    })}
                  </dd>
                </div>
              </dl>
              {store.reviewNote ? (
                <p className="mb-3 text-sm text-muted-foreground">
                  {t('seller.reviewNote', { note: store.reviewNote })}
                </p>
              ) : null}
              <div className="flex flex-wrap items-start gap-2">
                {store.status === 'PENDING' ? (
                  <>
                    <AdminAction
                      path={`/admin/stores/${store.id}/approve`}
                      label={t('admin.approve')}
                      variant="primary"
                    />
                    <AdminAction
                      path={`/admin/stores/${store.id}/reject`}
                      label={t('admin.reject')}
                      withReason
                    />
                  </>
                ) : null}
                {admin && store.status === 'ACTIVE' ? (
                  <AdminAction
                    path={`/admin/stores/${store.id}/suspend`}
                    label={t('admin.suspend')}
                    withReason
                    variant="destructive"
                  />
                ) : null}
                {admin && store.status !== 'PENDING' ? (
                  <Link
                    href={`/admin/finance/stores/${store.id}`}
                    className="inline-flex h-9 items-center px-2 text-sm text-primary hover:underline"
                  >
                    {t('admin.storeFinance')}
                  </Link>
                ) : null}
                {admin && store.status === 'SUSPENDED' ? (
                  <AdminAction
                    path={`/admin/stores/${store.id}/reactivate`}
                    label={t('admin.reactivate')}
                  />
                ) : null}
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
          hrefFor={(p) => href(status, p)}
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
