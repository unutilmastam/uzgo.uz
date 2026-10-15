import { ROLES, type Role } from '@uzgo/contracts';
import { Badge } from '@uzgo/ui/components/badge';
import { Button } from '@uzgo/ui/components/button';
import { EmptyState } from '@uzgo/ui/components/empty-state';
import { Input } from '@uzgo/ui/components/input';
import { Pagination } from '@uzgo/ui/components/pagination';
import { Users } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { AdminAction } from '@/components/admin/admin-action';
import { NativeSelect } from '@/components/panel/form-controls';
import { Link } from '@/i18n/navigation';
import { getAdminUsers } from '@/lib/admin-api';
import { formatPhone } from '@/lib/format-phone';
import { requireStaff } from '../../staff';

const STAFF: Role[] = ['MODERATOR', 'ADMIN', 'SUPER_ADMIN'];

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string; role?: string; page?: string }>;
}) {
  const me = await requireStaff('/admin/users', 'admin');
  const query = await searchParams;
  const phone = query.phone?.replace(/[^\d+]/g, '').slice(0, 16) ?? '';
  const role = ROLES.includes(query.role as Role) ? (query.role as Role) : undefined;
  const page = Math.max(Number.parseInt(query.page ?? '1', 10) || 1, 1);
  const [t, format, list] = await Promise.all([
    getTranslations(),
    getFormatter(),
    getAdminUsers({ ...(phone ? { phone } : {}), ...(role ? { role } : {}), page }),
  ]);
  const superAdmin = me.roles.includes('SUPER_ADMIN');
  const href = (p: number) =>
    `/admin/users?${new URLSearchParams({
      ...(phone ? { phone } : {}),
      ...(role ? { role } : {}),
      page: String(p),
    }).toString()}`;

  return (
    <div className="flex flex-col gap-4">
      <form className="flex flex-col gap-2 sm:flex-row sm:items-end" role="search">
        <div className="flex flex-col gap-1.5 sm:w-72">
          <label htmlFor="user-phone" className="text-sm font-medium">
            {t('admin.searchPhone')}
          </label>
          <Input id="user-phone" name="phone" inputMode="tel" defaultValue={phone} />
        </div>
        <div className="flex flex-col gap-1.5 sm:w-56">
          <label htmlFor="user-role" className="text-sm font-medium">
            {t('admin.role')}
          </label>
          <NativeSelect id="user-role" name="role" defaultValue={role ?? ''}>
            <option value="">{t('admin.anyRole')}</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`account.role_${r}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit">{t('admin.search')}</Button>
      </form>
      {!list || list.items.length === 0 ? (
        <EmptyState icon={<Users />} title={t('admin.empty')} />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {list.items.map((user) => {
            const isStaff = user.roles.some((r) => STAFF.includes(r));
            const canAct = user.id !== me.id && (!isStaff || superAdmin);
            return (
              <li key={user.id} className="flex flex-col gap-2 p-4" data-testid="admin-user">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium tabular-nums">{formatPhone(user.phone)}</span>
                  {user.name ? <span className="text-sm">{user.name}</span> : null}
                  {user.roles.map((r) => (
                    <Badge key={r} variant="secondary">
                      {t(`account.role_${r}`)}
                    </Badge>
                  ))}
                  {user.status === 'BLOCKED' ? (
                    <Badge variant="sale">{t('admin.blocked')}</Badge>
                  ) : null}
                  {user.totpEnabled ? <Badge variant="accent">{t('admin.totpOn')}</Badge> : null}
                </div>
                {user.lastLoginAt ? (
                  <span className="text-xs text-muted-foreground">
                    {t('admin.lastLogin', {
                      date: format.dateTime(new Date(user.lastLoginAt), {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }),
                    })}
                  </span>
                ) : null}
                {canAct ? (
                  <div className="flex flex-wrap gap-2">
                    {user.status === 'ACTIVE' ? (
                      <AdminAction
                        path={`/admin/users/${user.id}/block`}
                        label={t('admin.block')}
                        variant="destructive"
                      />
                    ) : (
                      <AdminAction
                        path={`/admin/users/${user.id}/unblock`}
                        label={t('admin.unblock')}
                      />
                    )}
                    {superAdmin && user.totpEnabled ? (
                      <AdminAction
                        path={`/admin/users/${user.id}/totp-reset`}
                        label={t('admin.totpReset')}
                      />
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {list ? (
        <Pagination
          page={list.page}
          pageCount={Math.ceil(list.total / list.pageSize)}
          linkAs={Link}
          hrefFor={href}
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
