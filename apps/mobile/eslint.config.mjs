import { react } from '@uzgo/config/eslint-react';

export default [
  {
    ignores: [
      'dist/**',
      'dist-web/**',
      'playwright-report/**',
      'test-results/**',
      '.expo/**',
      'expo-env.d.ts',
      'metro.config.js',
      'android/**',
      'ios/**',
    ],
  },
  ...react({ tsconfigRootDir: import.meta.dirname }),
];
