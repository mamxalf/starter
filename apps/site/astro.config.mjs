import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

// Fully static: deploy dist/ to any CDN. No server, no adapter.
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://example.com',
  trailingSlash: 'always',
  i18n: {
    defaultLocale: 'id',
    locales: ['id', 'en'],
    routing: { prefixDefaultLocale: true, redirectToDefaultLocale: false },
  },
  integrations: [
    sitemap({
      i18n: { defaultLocale: 'id', locales: { id: 'id-ID', en: 'en-US' } },
      // "/" only redirects to /id/: keep it out of the sitemap.
      filter: (page) => new URL(page).pathname !== '/',
    }),
  ],
  vite: { plugins: [tailwindcss()] },
})
