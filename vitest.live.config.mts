import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
export default defineConfig({
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
  test: {
    include: ['tests/live/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 600000,
    hookTimeout: 30000,
  },
});
