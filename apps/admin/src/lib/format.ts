const dateTime = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' })
const dateOnly = new Intl.DateTimeFormat('en', { dateStyle: 'medium' })

export const formatDateTime = (value: Date | null | undefined) =>
  value ? dateTime.format(value) : '—'

export const formatDate = (value: Date | null | undefined) => (value ? dateOnly.format(value) : '—')

/** Amounts are integers in the currency's smallest unit (see AGENTS.md); show them in major units. */
export function formatMoney(amount: number, currency: string) {
  const format = new Intl.NumberFormat('en', { style: 'currency', currency })
  const digits = format.resolvedOptions().maximumFractionDigits ?? 2
  return format.format(amount / 10 ** digits)
}
