import type { CategoryIcon } from '@/fixtures/catalog';

/** Decorative pastel tint per category (icons are aria-hidden). */
export const CATEGORY_TINT: Record<CategoryIcon, string> = {
  shirt: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
  smartphone: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  'washing-machine': 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  'shopping-basket': 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  sofa: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  sparkles: 'bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300',
  baby: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  dumbbell: 'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
};
