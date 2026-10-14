// ESLint flat config for the Next.js web app.
import nextPlugin from '@next/eslint-plugin-next';
import reactPlugin from 'eslint-plugin-react';
import { react } from './eslint-react.js';

/** @param {{ tsconfigRootDir: string }} options */
export function next(options) {
  return [
    ...react(options),
    {
      plugins: { '@next/next': nextPlugin, react: reactPlugin },
      rules: {
        ...nextPlugin.configs.recommended.rules,
        ...nextPlugin.configs['core-web-vitals'].rules,
        // Every user-visible string comes from the i18n message files.
        'react/jsx-no-literals': [
          'error',
          {
            noStrings: true,
            ignoreProps: true,
            allowedStrings: ['·', '/', '—', '×', '+', '-', ':', '+998'],
          },
        ],
      },
    },
  ];
}
