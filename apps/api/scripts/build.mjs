// Bundles the API into dist/ for production: one file per entry, workspace packages and
// most third-party code inlined. Only packages that must not be bundled stay external
// (they are installed by `pnpm deploy --prod` in the Docker image).
import { build } from 'esbuild'

const external = [
  '@sentry/node', // OpenTelemetry instrumentation patches modules at runtime
  'pg-native', // optional native driver that pg tries to require
]

await build({
  entryPoints: ['src/server.ts', 'src/worker.ts', 'src/migrate.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external,
  jsx: 'automatic',
  // ESM bundles need a real `require`/`__dirname` for CJS deps that use them.
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      "import { fileURLToPath as __fileURLToPath } from 'node:url';",
      'const require = __createRequire(import.meta.url);',
      'const __filename = __fileURLToPath(import.meta.url);',
      "const __dirname = __fileURLToPath(new URL('.', import.meta.url));",
    ].join(' '),
  },
  logLevel: 'warning',
})
console.log('api built → dist/server.js, dist/worker.js, dist/migrate.js')
