import { currentUserResponseSchema } from '@uzgo/contracts';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { View } from 'react-native';
import { AppText, Button, Card, Choice, EmptyState, Field, Screen } from '@/components/ui';
import { NotificationsCard } from '@/components/notifications-card';
import { WEB_URL } from '@/lib/config';
import { confirmAction } from '@/lib/dialogs';
import { formatPhone } from '@/lib/format';
import type { Locale } from '@/lib/i18n';
import { spacing } from '@/lib/theme';
import { useApp } from '@/state/app';

const NAME = /^[\p{L}][\p{L}ʻʼ'’ -]{0,49}$/u;

function ProfileCard() {
  const { api, t, user, refreshUser, errorText } = useApp();
  const [firstName, setFirstName] = useState(user?.profile.firstName ?? '');
  const [lastName, setLastName] = useState(user?.profile.lastName ?? '');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const invalid = (v: string) => v.trim() !== '' && !NAME.test(v.trim());

  async function save() {
    setPending(true);
    setMessage(null);
    try {
      await api.request('/users/me', {
        method: 'PATCH',
        body: { firstName: firstName.trim() || null, lastName: lastName.trim() || null },
        schema: currentUserResponseSchema,
      });
      await refreshUser();
      setMessage(t('saved'));
    } catch (err) {
      setMessage(errorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <AppText variant="heading">{t('profile')}</AppText>
      <Field
        label={t('firstName')}
        value={firstName}
        onChangeText={setFirstName}
        autoComplete="given-name"
        maxLength={50}
        error={invalid(firstName) ? t('invalidName') : null}
      />
      <Field
        label={t('lastName')}
        value={lastName}
        onChangeText={setLastName}
        autoComplete="family-name"
        maxLength={50}
        error={invalid(lastName) ? t('invalidName') : null}
      />
      {message ? (
        <AppText variant="small" accessibilityLiveRegion="polite">
          {message}
        </AppText>
      ) : null}
      <Button
        title={t('save')}
        loading={pending}
        disabled={invalid(firstName) || invalid(lastName)}
        onPress={() => void save()}
      />
    </Card>
  );
}

function LanguageCard() {
  const { api, t, locale, setLocale, user } = useApp();
  async function choose(next: Locale) {
    await setLocale(next);
    // SMS and push texts follow the account's language.
    if (user)
      await api
        .request('/users/me', { method: 'PATCH', body: { locale: next } })
        .catch(() => undefined);
  }
  return (
    <Card>
      <AppText variant="heading">{t('language')}</AppText>
      <Choice label="Oʻzbekcha" selected={locale === 'uz'} onPress={() => void choose('uz')} />
      <Choice label="Русский" selected={locale === 'ru'} onPress={() => void choose('ru')} />
    </Card>
  );
}

function LegalCard() {
  const { t, locale } = useApp();
  return (
    <Card>
      <AppText variant="heading">{t('legal')}</AppText>
      <Button
        title={t('termsLink')}
        variant="ghost"
        onPress={() => void WebBrowser.openBrowserAsync(`${WEB_URL}/${locale}/info/terms`)}
      />
      <Button
        title={t('privacyLink')}
        variant="ghost"
        onPress={() => void WebBrowser.openBrowserAsync(`${WEB_URL}/${locale}/info/privacy`)}
      />
      <AppText variant="small">
        {t('appVersion', { version: Constants.expoConfig?.version ?? '—' })}
      </AppText>
    </Card>
  );
}

export default function AccountScreen() {
  const { user, t, signOut } = useApp();
  if (!user) {
    return (
      <Screen>
        <EmptyState
          icon="person-circle-outline"
          title={t('guestTitle')}
          text={t('guestText')}
          action={{
            title: t('login'),
            onPress: () => {
              router.push('/login');
            },
          }}
        />
        <LanguageCard />
        <LegalCard />
      </Screen>
    );
  }
  const isSeller = user.roles.some((r) => r === 'SELLER_OWNER' || r === 'SELLER_STAFF');
  const name = user.profile.firstName;

  async function confirmLogout(everywhere: boolean) {
    const label = everywhere ? t('logoutAll') : t('logout');
    if (await confirmAction(t('logoutConfirm'), label, t('cancel'), true))
      await signOut(everywhere);
  }

  return (
    <Screen>
      <View style={{ gap: spacing.xs }}>
        <AppText variant="title">{name ? t('greeting', { name }) : t('greetingNoName')}</AppText>
        <AppText variant="muted">{formatPhone(user.phone)}</AppText>
      </View>
      <Button
        title={t('favorites')}
        icon="heart-outline"
        variant="outline"
        onPress={() => {
          router.push('/favorites');
        }}
      />
      <Button
        title={t('goTitle')}
        icon="car-outline"
        variant="secondary"
        onPress={() => {
          router.push('/go');
        }}
        testID="go-entry-account"
      />
      <Button
        title={user.roles.includes('DRIVER') ? t('driverMode') : t('goBecomeDriver')}
        icon="id-card-outline"
        variant="secondary"
        onPress={() => {
          router.push('/driver');
        }}
        testID="driver-mode"
      />
      {user.roles.includes('COURIER') ? (
        <Button
          title={t('courierTitle')}
          icon="bicycle-outline"
          variant="secondary"
          onPress={() => {
            router.push('/courier');
          }}
          testID="courier-mode"
        />
      ) : null}
      {isSeller ? (
        <Button
          title={t('sellerPanel')}
          icon="storefront-outline"
          variant="secondary"
          onPress={() => {
            router.push('/seller');
          }}
        />
      ) : null}
      <NotificationsCard />
      <ProfileCard />
      <LanguageCard />
      <LegalCard />
      <Card>
        <Button
          title={t('logout')}
          variant="outline"
          icon="log-out-outline"
          onPress={() => {
            void confirmLogout(false);
          }}
        />
        <Button
          title={t('logoutAll')}
          variant="ghost"
          onPress={() => {
            void confirmLogout(true);
          }}
        />
      </Card>
    </Screen>
  );
}
