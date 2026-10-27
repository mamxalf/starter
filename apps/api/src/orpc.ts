import { implement, ORPCError } from '@orpc/server'
import { contract, type Locale, type Role, TENANT_HEADER } from '@starter/contracts'
import { type DB, type Selectable, type Tenants, type Transaction, withTenant } from '@starter/db'
import { updateContext } from '@starter/platform/context'
import { isWritable } from './core/billing'
import { resolveUser } from './core/users'
import type { Deps } from './deps'

/** What every procedure receives. Built per request in app.ts. */
export type BaseContext = {
  deps: Deps
  /** Web Request (headers + url) so AuthPort adapters stay framework-agnostic. */
  request: Request
}

const base = implement(contract).$context<BaseContext>()

/** Requires a signed-in user. Adds `user`. */
export const authed = base.use(async ({ context, next }) => {
  const identity = await context.deps.auth.authenticate(context.request)
  if (!identity) throw new ORPCError('UNAUTHORIZED')
  const user = await resolveUser(context.deps.db, context.deps.auth, identity)
  updateContext({ userId: user.id, ...(user.locale ? { locale: user.locale } : {}) })
  return next({ context: { user } })
})

export type TenantScope = {
  tenant: Selectable<Tenants>
  role: Role
  subscriptionStatus: string
  locale: Locale
  /** Runs fn in a transaction with RLS scoped to this tenant. Use for ALL tenant data access. */
  tx: <T>(fn: (trx: Transaction<DB>) => Promise<T>) => Promise<T>
}

/**
 * Requires membership in the tenant named by the x-tenant-slug header.
 * Unknown tenant and non-member both answer NOT_FOUND, so slugs cannot be probed.
 */
export const tenantRead = authed.use(async ({ context, next }) => {
  const slug = context.request.headers.get(TENANT_HEADER)
  if (!slug) throw new ORPCError('BAD_REQUEST', { message: `Missing ${TENANT_HEADER} header` })

  const { db } = context.deps
  const tenant = await db
    .selectFrom('tenants')
    .selectAll()
    .where('slug', '=', slug)
    .executeTakeFirst()
  if (!tenant) throw new ORPCError('NOT_FOUND', { message: 'Workspace not found' })

  const scope = await withTenant(db, tenant.id, async (trx) => {
    const membership = await trx
      .selectFrom('memberships')
      .select('role')
      .where('tenant_id', '=', tenant.id)
      .where('user_id', '=', context.user.id)
      .executeTakeFirst()
    const subscription = await trx
      .selectFrom('subscriptions')
      .select('status')
      .where('tenant_id', '=', tenant.id)
      .executeTakeFirst()
    return { membership, status: subscription?.status ?? 'active' }
  })
  if (!scope.membership) throw new ORPCError('NOT_FOUND', { message: 'Workspace not found' })

  const locale = (context.user.locale ?? tenant.default_locale) as Locale
  updateContext({ tenantId: tenant.id, locale })

  const tenantScope: TenantScope = {
    tenant,
    role: scope.membership.role as Role,
    subscriptionStatus: scope.status,
    locale,
    tx: (fn) => withTenant(db, tenant.id, fn),
  }
  return next({ context: tenantScope })
})

/** Like tenantRead, but refuses changes while the subscription is suspended (read-only mode). */
export const tenantWrite = tenantRead.use(async ({ context, next }) => {
  if (!isWritable(context.subscriptionStatus)) {
    throw new ORPCError('FORBIDDEN', { message: 'Subscription suspended: workspace is read-only' })
  }
  return next()
})

export { base }
