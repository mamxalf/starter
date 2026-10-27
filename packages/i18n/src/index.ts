/**
 * Shared i18n for landing (Astro), dashboard (Vite) and server (emails, errors).
 * Edit messages in packages/i18n/messages/{locale}.json, then `pnpm --filter @starter/i18n build`.
 *
 * Client: call setLocale(locale, { reload: false }) once the user's locale is known.
 * Server: pass the locale explicitly, e.g. m.email_invite_subject(inputs, { locale }).
 */
export { formatDate, formatMoney, LOCALE_TAGS } from './format'
export { m } from './paraglide/messages.js'
export {
  baseLocale,
  getLocale,
  isLocale,
  type Locale,
  locales,
  setLocale,
} from './paraglide/runtime.js'
