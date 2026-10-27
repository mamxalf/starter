import { type Locale, locales } from '@starter/i18n'

export const LOCALE_TAGS: Record<Locale, string> = { id: 'id-ID', en: 'en-US' }
export const SITE_NAME = 'Starter'

/** /id/pricing/ → /pricing/ (path without the locale prefix) */
export function stripLocale(pathname: string): string {
  const [, first, ...rest] = pathname.split('/')
  return first && (locales as readonly string[]).includes(first) ? `/${rest.join('/')}` : pathname
}

/** hreflang alternates for every locale + x-default (the default locale). */
export function alternates(site: URL, pathname: string) {
  const path = stripLocale(pathname)
  const links = locales.map((locale) => ({
    hreflang: LOCALE_TAGS[locale],
    href: new URL(`/${locale}${path}`, site).href,
  }))
  return [...links, { hreflang: 'x-default', href: new URL(`/id${path}`, site).href }]
}

/** schema.org JSON-LD for the site. Extend per page (Product, FAQPage, Article...). */
export function websiteJsonLd(site: URL, locale: Locale, description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: new URL(`/${locale}/`, site).href,
    inLanguage: LOCALE_TAGS[locale],
    description,
  }
}
