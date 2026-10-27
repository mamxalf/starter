import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./src/test/setup.ts'],
    // Per-package cache: Turborepo runs packages' tests in parallel.
    fsModuleCachePath: resolve(import.meta.dirname, 'node_modules/.vitest-cache'),
    // Integration tests share one real Postgres test database; run files one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
})
