import { defineConfig } from 'vitest/config';

/** Separate config for live API harnesses so `yarn test` stays offline and fast. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/**/*.live.ts'],
    testTimeout: 1_800_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
