// ESLint flat config for React packages (shared UI, web app).
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { base } from './eslint.js';

/** @param {{ tsconfigRootDir: string }} options */
export function react(options) {
  return [
    ...base(options),
    {
      languageOptions: { globals: { ...globals.browser } },
      plugins: { 'react-hooks': reactHooks },
      rules: { ...reactHooks.configs.recommended.rules },
    },
  ];
}
