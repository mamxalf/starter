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
  server: {
    port: 5173,
    // Same-origin in dev too: /api goes to the API, so cookies and auth behave like production.
    proxy: { '/api': 'http://localhost:3000' },
  },
})
