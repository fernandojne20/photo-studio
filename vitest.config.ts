import { defineConfig } from 'vitest/config';

/**
 * Pure Node unit tests for the framework-independent logic (config helpers,
 * Sanity mappers, the srcset builder, the content fallback policy). No
 * coverage tooling or UI: `pnpm test` stays fast enough to run on every
 * push. `PUBLIC_SANITY_PROJECT_ID` and `PUBLIC_SANITY_DATASET` are provided
 * here so modules that validate the Sanity env at import time (see
 * `src/sanity/env.ts`) can load without a real `.env` file.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      PUBLIC_SANITY_PROJECT_ID: 'testproject',
      PUBLIC_SANITY_DATASET: 'testdataset',
    },
  },
});
