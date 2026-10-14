import { next } from '@uzgo/config/eslint-next';

export default [
  ...next({ tsconfigRootDir: import.meta.dirname }),
  { ignores: ['next-env.d.ts', 'postcss.config.mjs'] },
];
