import { next } from '@uzgo/config/eslint-next';

export default [
  ...next({ tsconfigRootDir: import.meta.dirname }),
  { ignores: ['next-env.d.ts', 'postcss.config.mjs', 'playwright-report/**', 'test-results/**'] },
  {
    // Tests assert on visible text; literals are expected there.
    files: ['**/*.test.ts', '**/*.test.tsx', 'e2e/**'],
    rules: { 'react/jsx-no-literals': 'off' },
  },
];
