'use client';

import type { CategoryNode } from '@uzgo/contracts';
import { Button } from '@uzgo/ui/components/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@uzgo/ui/components/sheet';
import { cn } from '@uzgo/ui/lib/cn';
import { LayoutGrid } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { CategoryIcon } from '@/components/category-icon';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { categoryTint } from '@/lib/category-style';

export function CatalogSheet({ categories }: { categories: CategoryNode[] }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="primary" size="sm" className="rounded-lg">
          <LayoutGrid aria-hidden="true" />
          {t('header.catalog')}
        </Button>
      </SheetTrigger>
      <SheetContent side="left" closeLabel={t('common.close')} aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle className="text-lg font-semibold">{t('header.allCategories')}</SheetTitle>
        </SheetHeader>
        <nav aria-label={t('header.categoriesNav')} className="overflow-y-auto px-2 pb-6">
          <ul className="flex flex-col gap-1">
            {categories.map((category) => (
              <li key={category.slug}>
                <Link
                  href={`/c/${category.slug}`}
                  onClick={close}
                  className="flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-semibold hover:bg-muted"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-8 items-center justify-center rounded-md',
                      categoryTint(category.icon),
                    )}
                  >
                    <CategoryIcon icon={category.icon} className="size-4.5" />
                  </span>
                  {category.name[locale]}
                </Link>
                {category.children.length > 0 ? (
                  <ul className="mb-2 ml-14 flex flex-col">
                    {category.children.map((child) => (
                      <li key={child.slug}>
                        <Link
                          href={`/c/${child.slug}`}
                          onClick={close}
                          className="flex min-h-9 items-center rounded-md px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          {child.name[locale]}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
