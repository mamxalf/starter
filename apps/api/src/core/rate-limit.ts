import { ORPCError } from '@orpc/server'

/**
 * Fixed-window limiter for sensitive procedures, keyed by our own user id (never a client header).
 * In-memory: correct for a single API process; use a shared store if you scale out.
 */
export function createLimiter({ max, windowMs = 60_000 }: { max: number; windowMs?: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>()

  return function check(key: string): void {
    const now = Date.now()
    for (const [k, entry] of hits) if (entry.resetAt <= now) hits.delete(k)

    const entry = hits.get(key)
    if (!entry) {
      hits.set(key, { count: 1, resetAt: now + windowMs })
      return
    }
    if (entry.count >= max) {
      throw new ORPCError('TOO_MANY_REQUESTS', { message: 'Too many requests, slow down' })
    }
    entry.count += 1
  }
}
