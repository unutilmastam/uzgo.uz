// ESLint flat config for the Next.js web app.
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { base } from './eslint.js';

/** @param {{ tsconfigRootDir: string }} options */
export function next(options) {
  return [
    ...base(options),
    {
      languageOptions: { globals: { ...globals.browser } },
      plugins: { '@next/next': nextPlugin, 'react-hooks': reactHooks },
      rules: {
        ...nextPlugin.configs.recommended.rules,
        ...nextPlugin.configs['core-web-vitals'].rules,
        ...reactHooks.configs.recommended.rules,
      },
    },
  ];
}
