import Ionicons from '@expo/vector-icons/Ionicons';
import type { IconName } from '@/components/ui';

/** Category icon names stored in the catalog (shared with the web's lucide icons). */
const ICONS: Record<string, IconName> = {
  shirt: 'shirt-outline',
  smartphone: 'phone-portrait-outline',
  'washing-machine': 'water-outline',
  'shopping-basket': 'basket-outline',
  sofa: 'bed-outline',
  sparkles: 'sparkles-outline',
  baby: 'happy-outline',
  dumbbell: 'barbell-outline',
};

export function CategoryIcon({
  icon,
  size = 22,
  color,
}: {
  icon: string | null;
  size?: number;
  color: string;
}) {
  return <Ionicons name={(icon && ICONS[icon]) || 'pricetag-outline'} size={size} color={color} />;
}
