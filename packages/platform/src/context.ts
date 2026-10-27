import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Per-request (or per-job) context. Logger, audit log, RLS and enqueued jobs
 * all read from here instead of threading these values through every call.
 */
export type RequestContext = {
  requestId: string
  locale: string
  tenantId?: string
  userId?: string
}

const storage = new AsyncLocalStorage<RequestContext>()

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn)
}

export function getContext(): RequestContext | undefined {
  return storage.getStore()
}

/** Adds values discovered mid-request (e.g. tenant after resolution). No-op outside a context. */
export function updateContext(patch: Partial<RequestContext>): void {
  const current = storage.getStore()
  if (current) Object.assign(current, patch)
}
