import { Button } from '@uzgo/ui/components/button';
import { EmptyState } from '@uzgo/ui/components/empty-state';
import { Input } from '@uzgo/ui/components/input';
import { ScrollText } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getAudit } from '@/lib/admin-api';
import { requireStaff } from '../../staff';

/** Read-only, newest first. Metadata is shown as stored (already masked at write time). */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; before?: string }>;
}) {
  await requireStaff('/admin/audit', 'admin');
  const query = await searchParams;
  const action = query.action?.trim().slice(0, 60) ?? '';
  const [t, format, list] = await Promise.all([
    getTranslations('admin'),
    getFormatter(),
    getAudit({ ...(action ? { action } : {}), ...(query.before ? { before: query.before } : {}) }),
  ]);
  const href = (before?: string) =>
    `/admin/audit?${new URLSearchParams({
      ...(action ? { action } : {}),
      ...(before ? { before } : {}),
    }).toString()}`;

  return (
    <div className="flex flex-col gap-4">
      <form className="flex flex-col gap-2 sm:flex-row sm:items-end" role="search">
        <div className="flex flex-col gap-1.5 sm:w-80">
          <label htmlFor="audit-action" className="text-sm font-medium">
            {t('action')}
          </label>
          <Input
            id="audit-action"
            name="action"
            defaultValue={action}
            aria-describedby="audit-hint"
          />
          <p id="audit-hint" className="text-xs text-muted-foreground">
            {t('actionHint')}
          </p>
        </div>
        <Button type="submit">{t('filter')}</Button>
      </form>
      {!list || list.items.length === 0 ? (
        <EmptyState icon={<ScrollText />} title={t('empty')} />
      ) : (
        <ol className="divide-y divide-border rounded-xl border border-border bg-card">
          {list.items.map((event) => (
            <li
              key={event.id}
              className="flex flex-col gap-1 p-4 text-sm"
              data-testid="audit-event"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-semibold">{event.action}</span>
                <span className="text-muted-foreground">
                  {[event.entityType, event.entityId].filter(Boolean).join(':')}
                </span>
                <span className="ml-auto text-muted-foreground tabular-nums">
                  {format.dateTime(new Date(event.createdAt), {
                    dateStyle: 'short',
                    timeStyle: 'medium',
                  })}
                </span>
              </div>
              <span className="tabular-nums">{event.actor ? event.actor.phone : t('system')}</span>
              {event.metadata ? (
                <code className="block overflow-x-auto rounded bg-muted p-2 text-xs">
                  {JSON.stringify(event.metadata)}
                </code>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      <div className="flex gap-2">
        {query.before ? (
          <Button asChild variant="outline">
            <Link href={href()}>{t('newest')}</Link>
          </Button>
        ) : null}
        {list?.nextBefore ? (
          <Button asChild variant="outline">
            <Link href={href(list.nextBefore)}>{t('older')}</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
