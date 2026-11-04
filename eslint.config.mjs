import { defineConfig, globalIgnores } from 'eslint/config';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';

const UI_FILES = [
  'src/app/**/*.{ts,tsx}',
  'src/components/**/*.{ts,tsx}',
  'src/hooks/**/*.{ts,tsx}',
];
const LIB_FILES = ['src/lib/**/*.ts'];

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypeScript,
  // Must come after the configs above: turns off rules that conflict with Prettier.
  prettier,
  globalIgnores(['.next/**', 'out/**', 'coverage/**', 'next-env.d.ts']),
  {
    // React code must reach Web Bluetooth only through src/lib/ble/.
    files: UI_FILES,
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'navigator',
          property: 'bluetooth',
          message:
            'Keep Web Bluetooth access in src/lib/ble/ (framework-agnostic). Call that module from components instead.',
        },
      ],
    },
  },
  {
    // src/lib/ is framework-agnostic TypeScript: no React, no Next.js.
    files: LIB_FILES,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react/*', 'react-dom', 'react-dom/*', 'next', 'next/*'],
              message: 'src/lib/ must stay framework-agnostic. Put React glue in src/hooks/.',
            },
          ],
        },
      ],
    },
  },
]);
