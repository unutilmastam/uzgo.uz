import {
  Baby,
  Dumbbell,
  type LucideProps,
  Shirt,
  ShoppingBasket,
  Smartphone,
  Sofa,
  Sparkles,
  WashingMachine,
} from 'lucide-react';
import type { CategoryIcon as IconName } from '@/fixtures/catalog';

const ICONS = {
  shirt: Shirt,
  smartphone: Smartphone,
  'washing-machine': WashingMachine,
  'shopping-basket': ShoppingBasket,
  sofa: Sofa,
  sparkles: Sparkles,
  baby: Baby,
  dumbbell: Dumbbell,
} satisfies Record<IconName, unknown>;

export function CategoryIcon({ name, ...props }: LucideProps & { name: IconName }) {
  const Icon = ICONS[name];
  return <Icon aria-hidden="true" {...props} />;
}
