// @ts-check
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import-x';
import unicornPlugin from 'eslint-plugin-unicorn';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import convexPlugin from '@convex-dev/eslint-plugin';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  // --- Global ignores ---
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.expo/**',
      'convex/_generated/**',
      '**/.turbo/**',
    ],
  },

  // --- Shared base for all TS/JS files ---
  ...tseslint.configs.recommended,
  {
    plugins: {
      'import-x': importPlugin,
      unicorn: unicornPlugin,
    },
    settings: {
      'import-x/resolver': {
        typescript: {
          project: [
            'packages/*/tsconfig.json',
            'apps/*/tsconfig.json',
            'tsconfig.base.json',
          ],
        },
      },
    },
    rules: {
      // Naming conventions: PascalCase types, no I-prefix
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'typeLike',
          format: ['PascalCase'],
          custom: {
            regex: '^(?!I[A-Z])',
            match: true,
          },
        },
      ],
      // Kebab-case filenames; allow PascalCase for .tsx React components
      'unicorn/filename-case': [
        'error',
        {
          cases: {
            kebabCase: true,
          },
          ignore: [
            /^[A-Z][a-zA-Z0-9]*\.tsx$/,
          ],
        },
      ],
      // Import order: external → workspace (@ember/*) → local
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          pathGroups: [
            {
              pattern: '@ember/**',
              group: 'internal',
              position: 'before',
            },
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
    },
  },

  // --- apps/web overrides ---
  {
    files: ['apps/web/**/*.{ts,tsx,js,jsx}'],
    plugins: {
      'react-hooks': reactHooksPlugin,
      'jsx-a11y': jsxA11yPlugin,
    },
    rules: {
      ...reactHooksPlugin.configs.recommended.rules,
      ...jsxA11yPlugin.flatConfigs.recommended.rules,
    },
  },

  // --- convex/ overrides ---
  {
    files: ['convex/**/*.{ts,js}'],
    plugins: {
      '@convex-dev': convexPlugin,
    },
    rules: {
      ...convexPlugin.configs.recommended.rules,
    },
  },

  // --- Prettier last (disables conflicting formatting rules) ---
  prettierConfig,
);
