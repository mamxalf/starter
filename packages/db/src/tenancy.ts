import { type Kysely, sql, type Transaction } from 'kysely'
import type { DB } from './types'

/**
 * Two layers of tenant isolation:
 *  1. Repos always filter by tenant_id (the primary guard).
 *  2. Postgres RLS policies check `app.tenant_id` (the safety net for a forgotten filter).
 *
 * `withTenant` opens a transaction and sets `app.tenant_id` for its duration only
 * (set_config(..., true) is transaction-local, so pooled connections never leak it).
 */
export async function withTenant<T>(
  db: Kysely<DB>,
  tenantId: string,
  fn: (trx: Transaction<DB>) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(async (trx) => {
    await sql`select set_config('app.tenant_id', ${tenantId}, true)`.execute(trx)
    return fn(trx)
  })
}

/**
 * Bypasses RLS for trusted system work that spans tenants:
 * listing a user's memberships, webhooks, billing jobs, seeds.
 * Never call this with input that came straight from a request.
 */
export async function withSystem<T>(
  db: Kysely<DB>,
  fn: (trx: Transaction<DB>) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(async (trx) => {
    await sql`select set_config('app.bypass_rls', 'on', true)`.execute(trx)
    return fn(trx)
  })
}
