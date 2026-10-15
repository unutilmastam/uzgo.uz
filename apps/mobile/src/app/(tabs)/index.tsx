import { AppText, Screen } from '@/components/ui';
import { useApp } from '@/state/app';

export default function Placeholder() {
  const { t } = useApp();
  return (
    <Screen>
      <AppText variant="title">{t('tabHome')}</AppText>
    </Screen>
  );
}
