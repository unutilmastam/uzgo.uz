import { mobileLoginResponseSchema, otpRequestResponseSchema } from '@uzgo/contracts';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { AppText, Button, Field, Screen } from '@/components/ui';
import { WEB_URL } from '@/lib/config';
import { formatPhone, isCompleteLocalPhone, toApiPhone } from '@/lib/format';
import { spacing } from '@/lib/theme';
import { useApp } from '@/state/app';

/** Only in-app paths are accepted as the destination after login. */
function safeNext(next: string | undefined): string | null {
  return next && /^\/[a-z0-9/[\]_-]*$/i.test(next) && !next.startsWith('//') ? next : null;
}

export default function LoginScreen() {
  const { api, t, locale, signIn, errorText } = useApp();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => {
      setCooldown((s) => s - 1);
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [cooldown]);

  async function requestCode() {
    setPending(true);
    setError(null);
    try {
      const res = await api.request('/auth/otp/request', {
        method: 'POST',
        body: { phone: toApiPhone(phone), locale },
        schema: otpRequestResponseSchema,
      });
      setStep('code');
      setCode('');
      setCooldown(res.resendInSeconds);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  async function verify(value: string) {
    setPending(true);
    setError(null);
    try {
      const res = await api.request('/auth/otp/verify', {
        method: 'POST',
        body: { phone: toApiPhone(phone), code: value },
        schema: mobileLoginResponseSchema,
      });
      await signIn(res.session.token, res.user);
      const target = safeNext(next);
      if (target) router.replace(target);
      else if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (err) {
      setError(errorText(err));
      setCode('');
    } finally {
      setPending(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('login'), presentation: 'modal' }} />
      {step === 'phone' ? (
        <View style={{ gap: spacing.lg }}>
          <AppText variant="title">{t('loginTitle')}</AppText>
          <AppText variant="muted">{t('loginSubtitle')}</AppText>
          <Field
            label={t('phoneLabel')}
            hint={t('phoneHint')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            autoFocus
            maxLength={20}
            error={error}
          />
          <Button
            title={t('sendCode')}
            loading={pending}
            disabled={!isCompleteLocalPhone(phone)}
            onPress={() => void requestCode()}
          />
          <AppText variant="small">{t('termsNote')}</AppText>
          <Button
            title={t('termsLink')}
            variant="ghost"
            onPress={() => void WebBrowser.openBrowserAsync(`${WEB_URL}/${locale}/info/terms`)}
          />
        </View>
      ) : (
        <View style={{ gap: spacing.lg }}>
          <AppText variant="title">{t('codeTitle')}</AppText>
          <AppText variant="muted">
            {t('codeSentTo', { phone: formatPhone(toApiPhone(phone)) })}
          </AppText>
          <Field
            label={t('codeLabel')}
            value={code}
            onChangeText={(value) => {
              const digits = value.replace(/\D/g, '').slice(0, 6);
              setCode(digits);
              if (digits.length === 6) void verify(digits);
            }}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            autoFocus
            maxLength={6}
            error={error}
          />
          <Button
            title={t('verify')}
            loading={pending}
            disabled={code.length !== 6}
            onPress={() => void verify(code)}
          />
          <Button
            title={cooldown > 0 ? t('resendIn', { seconds: cooldown }) : t('resend')}
            variant="outline"
            disabled={cooldown > 0 || pending}
            onPress={() => void requestCode()}
          />
          <Button
            title={t('changePhone')}
            variant="ghost"
            onPress={() => {
              setStep('phone');
              setError(null);
            }}
          />
        </View>
      )}
    </Screen>
  );
}
