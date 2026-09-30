// ESLint v9 flat config
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import pluginImport from 'eslint-plugin-import';
import pluginN from 'eslint-plugin-n';
import pluginPromise from 'eslint-plugin-promise';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: false
      }
    },
    plugins: {
      '@typescript-eslint': tseslint,
      import: pluginImport,
      n: pluginN,
      promise: pluginPromise
    },
    rules: {
      'no-console': 'off',
      'import/order': ['warn', { 'newlines-between': 'always' }],
      'n/no-unsupported-features/es-syntax': 'off'
    }
  }
];


