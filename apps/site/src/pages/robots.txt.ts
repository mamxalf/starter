import type { APIRoute } from 'astro'

/** Only production is indexable. Staging/preview builds (DEPLOY_ENV != production) are blocked. */
export const GET: APIRoute = ({ site }) => {
  const production = process.env.DEPLOY_ENV === 'production'
  const body = production
    ? `User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap-index.xml', site).href}\n`
    : 'User-agent: *\nDisallow: /\n'
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
}
