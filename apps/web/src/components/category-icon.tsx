import {
  Baby,
  Dumbbell,
  type LucideProps,
  Package,
  Shirt,
  ShoppingBasket,
  Smartphone,
  Sofa,
  Sparkles,
  WashingMachine,
} from 'lucide-react';

const ICONS = {
  shirt: Shirt,
  smartphone: Smartphone,
  'washing-machine': WashingMachine,
  'shopping-basket': ShoppingBasket,
  sofa: Sofa,
  sparkles: Sparkles,
  baby: Baby,
  dumbbell: Dumbbell,
} as const;

export type CategoryIconName = keyof typeof ICONS;

export function isCategoryIcon(name: string | null | undefined): name is CategoryIconName {
  return typeof name === 'string' && name in ICONS;
}

/** Category icon by name (from the API); a neutral package icon for unknown names. */
export function CategoryIcon({
  icon,
  ...props
}: Omit<LucideProps, 'icon'> & { icon: string | null | undefined }) {
  const Icon = isCategoryIcon(icon) ? ICONS[icon] : Package;
  return <Icon aria-hidden="true" {...props} />;
}
