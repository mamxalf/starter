import { getLocale, type Locale } from './paraglide/runtime.js'

/** BCP 47 tags used by Intl for each app locale. */
export const LOCALE_TAGS: Record<Locale, string> = { id: 'id-ID', en: 'en-US' }

export function formatDate(date: Date, locale: Locale = getLocale()): string {
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], { dateStyle: 'medium' }).format(date)
}

/** Amount in the currency's smallest unit as stored (IDR has no minor unit in practice). */
export function formatMoney(
  amount: number,
  currency = 'IDR',
  locale: Locale = getLocale(),
): string {
  return new Intl.NumberFormat(LOCALE_TAGS[locale], {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'IDR' ? 0 : 2,
  }).format(amount)
}
