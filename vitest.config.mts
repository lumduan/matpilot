import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // Unit tests cover pure, framework-agnostic logic only. Browser globals such as
    // `navigator` are mocked explicitly in each test.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
  },
});
