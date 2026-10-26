import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/*.d.ts', '**/.wrangler/**', 'packages/catalog/fixtures/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },
  {
    // The domain core must not reach for a platform. This rule is the
    // mechanical enforcement of docs/adr/0001-ports-and-adapters.md.
    files: ['packages/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['node:*'], message: 'The engine is platform-free. Define a port and implement it in an adapter package.' },
            { group: ['@cloudflare/*', 'cloudflare:*'], message: 'The engine is platform-free. Put Cloudflare code in @deletewe/adapters-cf.' },
            { group: ['@deletewe/adapters-*'], message: 'The engine must not depend on its adapters.' },
          ],
        },
      ],
    },
  },
  {
    // Binaries and the mock broker legitimately write to stdout.
    files: ['**/bin/**/*.ts', '**/bin.ts', 'apps/mock-broker/**/*.ts', 'apps/selfhost/**/*.ts', 'packages/cli/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/*.test.ts', 'tests/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off', 'no-console': 'off' },
  },
);
