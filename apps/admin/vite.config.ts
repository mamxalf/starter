import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // .env lives at the repo root (shared with the API).
  envDir: '../..',
  plugins: [
    // Must come before react(): generates src/routeTree.gen.ts and splits routes into chunks.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    // Mirrors `paths` in tsconfig.json (TypeScript 7 has no baseUrl).
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
  server: {
    port: 5174,
    // Same-origin in dev too: /api goes to the API, so auth behaves like production.
    proxy: { '/api': 'http://localhost:3000' },
  },
})
