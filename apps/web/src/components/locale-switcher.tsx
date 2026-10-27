import { getLocale, type Locale, locales, setLocale } from '@starter/i18n'
import { useMutation } from '@tanstack/react-query'
import { orpc } from '../lib/api'

/**
 * Saves the choice on the user (emails and other devices follow), then reloads:
 * Paraglide's recommended way to re-render every message in the new locale.
 */
export function LocaleSwitcher() {
  const save = useMutation(orpc.me.updateLocale.mutationOptions())
  return (
    <select
      aria-label="Language"
      className="h-8 rounded-ui border-ui bg-surface px-2 text-sm uppercase"
      defaultValue={getLocale()}
      disabled={save.isPending}
      onChange={async (e) => {
        const locale = e.target.value as Locale
        await save.mutateAsync({ locale })
        setLocale(locale)
      }}
    >
      {locales.map((locale) => (
        <option key={locale} value={locale}>
          {locale}
        </option>
      ))}
    </select>
  )
}
