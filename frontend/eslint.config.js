import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

// Flat config. eslint-plugin-react is deliberately absent: it does not yet
// support ESLint 10, and the rules that actually matter here - unused imports
// and variables, and the rules of hooks - live in the two configs below.
export default [
  { ignores: ['build/**', 'coverage/**', 'node_modules/**'] },

  js.configs.recommended,
  reactHooks.configs.flat.recommended,

  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      // The dead code this was added to catch: unused MUI imports and stats
      // that were computed and thrown away on every render.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  {
    files: ['**/*.test.{js,jsx}', 'src/setupTests.js'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
];
