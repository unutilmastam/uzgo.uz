'use client';

import { Button } from '@uzgo/ui/components/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@uzgo/ui/components/sheet';
import { LayoutGrid } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { CategoryIcon } from '@/components/category-icon';
import { categories } from '@/fixtures/catalog';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';

export function CatalogSheet() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState(false);

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
        <nav aria-label={t('header.categoriesNav')} className="overflow-y-auto px-2 pb-4">
          <ul className="flex flex-col">
            {categories.map((category) => (
              <li key={category.slug}>
                <Link
                  href={{ pathname: '/search', query: { category: category.slug } }}
                  onClick={() => {
                    setOpen(false);
                  }}
                  className="flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-medium hover:bg-muted"
                >
                  <CategoryIcon name={category.icon} className="size-5 text-primary" />
                  {category.name[locale]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
