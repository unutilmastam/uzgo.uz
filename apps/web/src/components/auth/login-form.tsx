'use client';

import type { OtpRequestResponse } from '@uzgo/contracts';
import { Button } from '@uzgo/ui/components/button';
import { Input } from '@uzgo/ui/components/input';
import { ArrowLeft } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { type SyntheticEvent, useEffect, useId, useRef, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { ApiClientError, apiClient } from '@/lib/api-client';
import { formatPhone } from '@/lib/format-phone';

const KNOWN_ERRORS = new Set([
  'INVALID_PHONE',
  'VALIDATION_FAILED',
  'INVALID_CODE',
  'OTP_RESEND_TOO_SOON',
  'OTP_LIMIT_REACHED',
  'RATE_LIMITED',
  'ACCOUNT_BLOCKED',
  'SMS_UNAVAILABLE',
]);

/** Accepts "90 123 45 67" (Uzbek default) or a full international number. */
function toApiPhone(input: string): string {
  const trimmed = input.trim();
  return trimmed.startsWith('+') ? trimmed : `+998${trimmed.replace(/\D/g, '')}`;
}

export function LoginForm({ next }: { next: string }) {
  const t = useTranslations('auth');
  const locale = useLocale() as 'uz' | 'ru';
  const router = useRouter();
  const phoneId = useId();
  const codeId = useId();
  const errorId = useId();
  const codeRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (step !== 'code') return;
    codeRef.current?.focus();
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [step]);

  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));

  function showError(err: unknown) {
    const code = err instanceof ApiClientError ? err.code : 'generic';
    if (KNOWN_ERRORS.has(code)) {
      setError(t(`error_${code}`));
      return;
    }
    // Unexpected errors keep their code and status visible: easier to report.
    const status = err instanceof ApiClientError && err.status > 0 ? `, ${String(err.status)}` : '';
    setError(`${t('error_generic')} (${code}${status})`);
  }

  async function sendCode() {
    setPending(true);
    setError(null);
    try {
      const res = await apiClient<OtpRequestResponse>('/auth/otp/request', {
        method: 'POST',
        body: { phone: toApiPhone(phone), locale },
      });
      setResendAt(Date.now() + res.resendInSeconds * 1000);
      setNow(Date.now());
      setCode('');
      setStep('code');
    } catch (err) {
      showError(err);
    } finally {
      setPending(false);
    }
  }

  async function verify(value: string) {
    setPending(true);
    setError(null);
    try {
      await apiClient('/auth/otp/verify', {
        method: 'POST',
        body: { phone: toApiPhone(phone), code: value },
      });
      router.replace(next);
      router.refresh();
    } catch (err) {
      showError(err);
      setPending(false);
    }
  }

  function onPhoneSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendCode();
  }

  function onCodeSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (/^\d{6}$/.test(code)) void verify(code);
  }

  const errorMessage = error ? (
    <p id={errorId} role="alert" className="text-sm font-medium text-destructive">
      {error}
    </p>
  ) : null;

  if (step === 'phone') {
    return (
      <form onSubmit={onPhoneSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={phoneId} className="text-sm font-medium">
            {t('phoneLabel')}
          </label>
          <div className="flex items-center rounded-md border border-input bg-background focus-within:border-ring focus-within:outline-2 focus-within:outline-ring">
            <span aria-hidden="true" className="pl-3 text-base text-muted-foreground md:text-sm">
              +998
            </span>
            <Input
              id={phoneId}
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              required
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
              }}
              placeholder="90 123 45 67"
              aria-describedby={error ? errorId : undefined}
              aria-invalid={error ? true : undefined}
              className="border-0 focus-visible:outline-0"
            />
          </div>
          <p className="text-xs text-muted-foreground">{t('phoneHint')}</p>
        </div>
        {errorMessage}
        <Button type="submit" size="lg" disabled={pending || phone.trim().length < 7}>
          {t('sendCode')}
        </Button>
        <p className="text-xs text-muted-foreground">
          <Link href="/info/terms" className="underline underline-offset-2 hover:text-foreground">
            {t('terms')}
          </Link>
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={onCodeSubmit} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-muted-foreground">
        {t('codeSentTo', { phone: formatPhone(toApiPhone(phone)) })}
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={codeId} className="text-sm font-medium">
          {t('codeLabel')}
        </label>
        <Input
          ref={codeRef}
          id={codeId}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          value={code}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
            setCode(digits);
            if (digits.length === 6 && !pending) void verify(digits);
          }}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
          className="h-14 text-center text-2xl font-semibold tracking-[0.5em] tabular-nums md:text-2xl"
        />
      </div>
      {errorMessage}
      <Button type="submit" size="lg" disabled={pending || code.length !== 6}>
        {t('verify')}
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setStep('phone');
            setError(null);
          }}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t('changePhone')}
        </Button>
        {secondsLeft > 0 ? (
          <span className="text-muted-foreground tabular-nums" aria-live="off">
            {t('resendIn', { seconds: secondsLeft })}
          </span>
        ) : (
          <Button
            type="button"
            variant="link"
            size="sm"
            disabled={pending}
            onClick={() => void sendCode()}
          >
            {t('resend')}
          </Button>
        )}
      </div>
    </form>
  );
}
