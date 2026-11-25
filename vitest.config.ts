import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __EDITION__: JSON.stringify('personal') },
  test: {
    environment: 'node',
    include: [
      'core/**/*.test.ts',
      'server/**/*.test.ts',
      'scripts/**/*.test.mjs',
      'ui/**/*.test.ts',
    ],
    testTimeout: 30_000,
  },
});
