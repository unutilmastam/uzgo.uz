import { base } from '@uzgo/config/eslint';

export default [
  ...base({ tsconfigRootDir: import.meta.dirname }),
  {
    // Nest uses classes with decorators only (modules); empty classes are idiomatic there.
    rules: { '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }] },
  },
  {
    files: ['prisma/seed.ts', 'scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
];
