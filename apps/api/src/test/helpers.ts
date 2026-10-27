import { createRouterClient } from '@orpc/server'
import { fakeAuth } from '@starter/auth'
import { TENANT_HEADER } from '@starter/contracts'
import type { Database } from '@starter/db'
import { createTestDb } from '@starter/db/testing'
import { runWithContext } from '@starter/platform/context'
import { inlineQueue } from '@starter/platform/jobs'
import { memoryMailer } from '@starter/platform/mail'
import { memoryStorage } from '@starter/platform/storage'
import { adminRouter } from '../admin/router'
import type { Deps } from '../deps'
import { jobHandlers } from '../jobs/handlers'
import { router } from '../router'

/**
 * Real Postgres (TEST_DATABASE_URL) + in-memory fakes for every vendor.
 * Jobs run inline, so "invite → email sent" is testable end to end.
 */
export async function createTestDeps(options: { admin?: Partial<Deps['admin']> } = {}) {
  const db: Database = await createTestDb()
  const auth = fakeAuth()
  const mailer = memoryMailer('App <noreply@mail.example.com>')
  const storage = memoryStorage()
  const queue = inlineQueue()
  const deps = {
    db,
    auth,
    mailer,
    storage,
    queue,
    jobAdmin: queue,
    config: { appUrl: 'http://app.test', mailFrom: 'App <noreply@mail.example.com>' },
    // Platform admin API is off unless a test lists admins.
    admin: { platformAdmins: [] as string[], ...options.admin },
  } satisfies Deps
  for (const registration of jobHandlers(deps)) queue.register(registration)

  /** Registers a user at the fake provider. */
  const signUp = (externalId: string, email: string, emailVerified = true) =>
    auth.register(externalId, { email, emailVerified, name: externalId })

  /** Typed API client acting as `externalId`, optionally inside a tenant. */
  const clientAs = (externalId: string, tenantSlug?: string) => {
    const headers: Record<string, string> = { authorization: auth.tokenFor(externalId) }
    if (tenantSlug) headers[TENANT_HEADER] = tenantSlug
    const client = createRouterClient(router, {
      context: () => ({ deps, request: new Request('http://api.test/', { headers }) }),
    })
    return client
  }

  /** Typed client for the platform admin API, acting as `externalId`. */
  const adminClientAs = (externalId: string) =>
    createRouterClient(adminRouter, {
      context: () => ({
        deps,
        request: new Request('http://admin.test/', {
          headers: { authorization: auth.tokenFor(externalId) },
        }),
      }),
    })

  /** Like a real request: each call runs inside its own request context. */
  const inRequest = <T>(fn: () => Promise<T>) =>
    runWithContext({ requestId: crypto.randomUUID(), locale: 'id' }, fn)

  return { deps, db, auth, mailer, storage, queue, signUp, clientAs, adminClientAs, inRequest }
}

export type TestKit = Awaited<ReturnType<typeof createTestDeps>>
