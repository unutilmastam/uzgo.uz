import { colors, radius, spacing } from '@uzgo/ui/lib/tokens';
import { useColorScheme } from 'react-native';

export { radius, spacing };
export type Colors = (typeof colors)['light'] | (typeof colors)['dark'];

/** Design tokens for the current light/dark mode (same values as the website). */
export function useColors(): Colors {
  return useColorScheme() === 'dark' ? colors.dark : colors.light;
}
