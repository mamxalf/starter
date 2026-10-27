/** First validation message from a TanStack Form field (Standard Schema issues or strings). */
export function firstError(errors: readonly unknown[]): string | undefined {
  const first = errors[0]
  if (!first) return undefined
  if (typeof first === 'string') return first
  if (typeof first === 'object' && 'message' in first) return String(first.message)
  return undefined
}

/** Human message from an oRPC error (CONFLICT, FORBIDDEN, ...). */
export function rpcErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return 'Something went wrong'
}
