import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const pkg = (name: string, dir = name) =>
  fileURLToPath(new URL(`./packages/${dir}/src/index.ts`, import.meta.url));

const app = (name: string) => fileURLToPath(new URL(`./apps/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@deletewe/schema': pkg('schema'),
      '@deletewe/catalog': pkg('catalog'),
      '@deletewe/engine': pkg('engine'),
      '@deletewe/browser': pkg('browser'),
      '@deletewe/adapters-node': pkg('adapters-node'),
      '@deletewe/adapters-cf': pkg('adapters-cf'),
      '@deletewe/web': pkg('web'),
      '@deletewe/mock-broker': app('mock-broker'),
    },
  },
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
