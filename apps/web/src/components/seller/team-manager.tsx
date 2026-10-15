'use client';

import type { StoreMember } from '@uzgo/contracts';
import { Badge } from '@uzgo/ui/components/badge';
import { Button } from '@uzgo/ui/components/button';
import { Input } from '@uzgo/ui/components/input';
import { toast } from '@uzgo/ui/components/toast';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { Field, FormError } from '@/components/panel/form-controls';
import { useErrorMessage } from '@/components/panel/use-error-message';
import { useRouter } from '@/i18n/navigation';
import { apiClient } from '@/lib/api-client';
import { formatPhone } from '@/lib/format-phone';

export function TeamManager({ storeId, members }: { storeId: string; members: StoreMember[] }) {
  const t = useTranslations('seller');
  const errorMessage = useErrorMessage('seller');
  const router = useRouter();
  const id = useId();
  const [phone, setPhone] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/seller/stores/${storeId}/members`;

  async function add() {
    setPending(true);
    setError(null);
    try {
      await apiClient(base, { method: 'POST', body: { phone: phone.trim() } });
      setPhone('');
      toast.success(t('memberAdded'));
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function remove(userId: string) {
    setPending(true);
    try {
      await apiClient(`${base}/${userId}`, { method: 'DELETE' });
      toast.success(t('memberRemoved'));
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">{t('teamHint')}</p>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {members.map((member) => (
          <li key={member.userId} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{member.name ?? formatPhone(member.phone)}</p>
              {member.name ? (
                <p className="text-sm text-muted-foreground tabular-nums">
                  {formatPhone(member.phone)}
                </p>
              ) : null}
            </div>
            <Badge variant={member.role === 'OWNER' ? 'primary' : 'secondary'}>
              {t(`role_${member.role}`)}
            </Badge>
            {member.role === 'STAFF' ? (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => void remove(member.userId)}
              >
                {t('removeMember')}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <Field id={`${id}-phone`} label={t('memberPhone')} className="sm:w-72">
          <Input
            id={`${id}-phone`}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            maxLength={20}
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
            }}
          />
        </Field>
        <Button type="submit" disabled={pending || phone.trim().length < 7}>
          {t('addMember')}
        </Button>
      </form>
      <FormError id={`${id}-error`} message={error} />
    </div>
  );
}
