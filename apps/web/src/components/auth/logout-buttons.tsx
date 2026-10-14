'use client';

import { Button } from '@uzgo/ui/components/button';
import { toast } from '@uzgo/ui/components/toast';
import { LogOut, ShieldOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { apiClient } from '@/lib/api-client';

export function LogoutButtons() {
  const t = useTranslations();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function run(path: '/auth/logout' | '/auth/logout-all') {
    setPending(true);
    try {
      await apiClient(path, { method: 'POST' });
      router.replace('/login');
      router.refresh();
    } catch {
      toast.error(t('auth.error_generic'));
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={pending} onClick={() => void run('/auth/logout')}>
          <LogOut aria-hidden="true" className="size-4" />
          {t('account.logout')}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => void run('/auth/logout-all')}>
          <ShieldOff aria-hidden="true" className="size-4" />
          {t('account.logoutAll')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('account.logoutAllHint')}</p>
    </div>
  );
}
