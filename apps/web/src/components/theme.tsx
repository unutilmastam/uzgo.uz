'use client';

import { Button } from '@uzgo/ui/components/button';
import { Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';

export const THEME_STORAGE_KEY = 'uzgo-theme';

/**
 * Runs before paint to apply the saved theme (or the system preference) and
 * avoid a flash of the wrong theme. Must stay tiny and dependency-free.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;

export function ThemeToggle() {
  const t = useTranslations('header');

  function toggle() {
    const dark = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, dark ? 'dark' : 'light');
    } catch {
      // Storage may be unavailable (private mode); the toggle still works for this page.
    }
  }

  // Both labels/icons are rendered and switched by CSS, so server and client
  // markup match regardless of the saved theme.
  return (
    <Button variant="ghost" size="icon" onClick={toggle}>
      <Moon aria-hidden="true" className="dark:hidden" />
      <Sun aria-hidden="true" className="hidden dark:block" />
      <span className="sr-only dark:hidden">{t('themeToDark')}</span>
      <span className="sr-only hidden dark:inline">{t('themeToLight')}</span>
    </Button>
  );
}
