'use client';

import type { TotpSetupResponse, TotpStatus } from '@uzgo/contracts';
import { Button } from '@uzgo/ui/components/button';
import { Input } from '@uzgo/ui/components/input';
import { toast } from '@uzgo/ui/components/toast';
import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { Field, FormError } from '@/components/panel/form-controls';
import { useErrorMessage } from '@/components/panel/use-error-message';
import { useRouter } from '@/i18n/navigation';
import { apiClient } from '@/lib/api-client';
import { safeNextPath } from '@/lib/safe-next';

/** Groups the base32 secret in fours so it can be typed into an app by hand. */
const grouped = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim();

/** Staff second factor: enrolment (secret + first code) or per-session verification. */
export function TotpSetup({ status, next }: { status: TotpStatus; next: string | undefined }) {
  const t = useTranslations('admin');
  const errorMessage = useErrorMessage('admin');
  const router = useRouter();
  const id = useId();
  const [setup, setSetup] = useState<TotpSetupResponse | null>(null);
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status.enabled && status.sessionVerified) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm font-medium">
        <ShieldCheck aria-hidden="true" className="size-5 text-accent" />
        {t('verifiedStatus')}
      </p>
    );
  }

  async function start() {
    setPending(true);
    setError(null);
    try {
      setSetup(await apiClient<TotpSetupResponse>('/auth/totp/setup', { method: 'POST' }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      await apiClient(status.enabled ? '/auth/totp/verify' : '/auth/totp/enable', {
        method: 'POST',
        body: { code },
      });
      toast.success(t('verified'));
      router.push(safeNextPath(next, '/admin'));
      router.refresh();
    } catch (err) {
      setCode('');
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  const codeForm = (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void confirm();
      }}
    >
      <Field id={`${id}-code`} label={t('totpCode')} className="sm:w-56">
        <Input
          id={`${id}-code`}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          pattern="\d{6}"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, ''));
          }}
        />
      </Field>
      <Button type="submit" disabled={pending || code.length !== 6}>
        {status.enabled ? t('verify') : t('enable')}
      </Button>
    </form>
  );

  return (
    <div className="flex flex-col gap-4">
      {status.enabled ? (
        <>
          <p className="text-sm">{t('verifyIntro')}</p>
          {codeForm}
          <p className="text-sm text-muted-foreground">{t('lostDevice')}</p>
        </>
      ) : setup ? (
        <>
          <p className="text-sm">{t('setupStep1')}</p>
          <Button asChild variant="outline" className="w-fit">
            <a href={setup.otpauthUri}>{t('openInApp')}</a>
          </Button>
          <div>
            <p className="text-sm text-muted-foreground">{t('secretKey')}</p>
            <p
              className="font-mono text-lg font-semibold tracking-wider break-all select-all"
              data-testid="totp-secret"
              data-secret={setup.secret}
            >
              {grouped(setup.secret)}
            </p>
            <p className="text-sm text-destructive">{t('secretWarning')}</p>
          </div>
          <p className="text-sm">{t('setupStep2')}</p>
          {codeForm}
        </>
      ) : (
        <>
          <p className="text-sm">{t('securityIntro')}</p>
          <Button className="w-fit" disabled={pending} onClick={() => void start()}>
            {t('setupStart')}
          </Button>
        </>
      )}
      <FormError id={`${id}-error`} message={error} />
    </div>
  );
}
