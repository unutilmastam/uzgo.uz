// Shared ESLint flat config for all UZGO TypeScript packages.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** @param {{ tsconfigRootDir: string }} options */
export function base({ tsconfigRootDir }) {
  return tseslint.config(
    {
      ignores: ['**/dist/**', '**/.next/**', '**/coverage/**', '**/generated/**'],
    },
    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    {
      languageOptions: {
        globals: { ...globals.node },
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      rules: {
        '@typescript-eslint/consistent-type-imports': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
        '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
        eqeqeq: ['error', 'always'],
        'no-console': 'error',
      },
    },
    {
      files: ['**/*.js', '**/*.mjs'],
      ...tseslint.configs.disableTypeChecked,
    },
  );
}
