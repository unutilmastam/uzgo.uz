/**
 * Design tokens for non-CSS clients (the mobile app). Same values as
 * `styles/tokens.css`; `tokens.test.ts` fails if the two drift apart.
 */
export const colors = {
  light: {
    background: '#ffffff',
    foreground: '#151a25',
    card: '#ffffff',
    cardForeground: '#151a25',
    popover: '#ffffff',
    popoverForeground: '#151a25',
    muted: '#f3f5f8',
    mutedForeground: '#5a6376',
    border: '#dde1e8',
    input: '#8a93a6',
    primary: '#143c8f',
    primaryHover: '#0f2e6e',
    primaryForeground: '#ffffff',
    secondary: '#e8effd',
    secondaryHover: '#d0defa',
    secondaryForeground: '#143c8f',
    accent: '#047a4e',
    accentHover: '#03653f',
    accentForeground: '#ffffff',
    brandGo: '#059862',
    sale: '#c2410c',
    saleForeground: '#ffffff',
    success: '#047a4e',
    warning: '#b45309',
    destructive: '#c42b32',
    destructiveForeground: '#ffffff',
    ring: '#2c63d6',
  },
  dark: {
    background: '#0c1018',
    foreground: '#edeff3',
    card: '#151a25',
    cardForeground: '#edeff3',
    popover: '#151a25',
    popoverForeground: '#edeff3',
    muted: '#1c2230',
    mutedForeground: '#a3abbb',
    border: '#2a3142',
    input: '#5c6579',
    primary: '#86acf2',
    primaryHover: '#a9c4f6',
    primaryForeground: '#0a1f4d',
    secondary: '#1b2a4d',
    secondaryHover: '#243868',
    secondaryForeground: '#d0defa',
    accent: '#3dd093',
    accentHover: '#7fe3b8',
    accentForeground: '#0c1018',
    brandGo: '#3dd093',
    sale: '#fb8b5b',
    saleForeground: '#0c1018',
    success: '#3dd093',
    warning: '#f5b454',
    destructive: '#f2777c',
    destructiveForeground: '#0c1018',
    ring: '#7aa3f0',
  },
} as const;

export type ColorScheme = keyof typeof colors;
export type ColorToken = keyof (typeof colors)['light'];

export const radius = { sm: 6, md: 10, lg: 14, xl: 20, full: 999 } as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
