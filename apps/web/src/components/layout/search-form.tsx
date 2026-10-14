import { Button } from '@uzgo/ui/components/button';
import { Input } from '@uzgo/ui/components/input';
import { cn } from '@uzgo/ui/lib/cn';
import { Search } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { getPathname } from '@/i18n/navigation';

/** Plain GET form: works without JavaScript. Results arrive in Phase 4. */
export async function SearchForm({ className, id }: { className?: string; id: string }) {
  const t = await getTranslations('header');
  const locale = await getLocale();

  return (
    <form
      role="search"
      action={getPathname({ href: '/search', locale })}
      className={cn('relative flex w-full items-center', className)}
    >
      <label htmlFor={id} className="sr-only">
        {t('searchLabel')}
      </label>
      <Input
        id={id}
        name="q"
        type="search"
        maxLength={200}
        autoComplete="off"
        enterKeyHint="search"
        placeholder={t('searchPlaceholder')}
        className="h-11 rounded-lg bg-muted pr-12 md:h-12"
      />
      <Button
        type="submit"
        size="icon-sm"
        className="absolute right-1.5"
        aria-label={t('searchSubmit')}
      >
        <Search aria-hidden="true" />
      </Button>
    </form>
  );
}
