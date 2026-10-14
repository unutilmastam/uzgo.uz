import { Button } from '@uzgo/ui/components/button';
import { EmptyState } from '@uzgo/ui/components/empty-state';
import { SearchX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function NotFound() {
  const t = useTranslations();
  return (
    <EmptyState
      icon={<SearchX />}
      title={t('states.notFoundTitle')}
      description={t('states.notFoundDescription')}
      action={
        <Button asChild>
          <Link href="/">{t('search.backHome')}</Link>
        </Button>
      }
    />
  );
}
