import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Per-package cache: Turborepo runs packages' tests in parallel.
    fsModuleCachePath: resolve(import.meta.dirname, 'node_modules/.vitest-cache'),
  },
})
