import { ORPCError } from '@orpc/server'
import type { AdminInputs, AdminOutputs } from '@starter/contracts/admin'
import { type DB, type Transaction, withSystem } from '@starter/db'
import * as billing from '../../core/billing'
import type { User } from '../../core/users'
import type { Deps } from '../../deps'
import { recordPlatformAudit } from '../platform-audit'
import { pageOffset } from '../sql'
import * as repo from './tenants.repo'

type Status = AdminOutputs['tenants']['setSuspended']['status']

const notFound = () => new ORPCError('NOT_FOUND', { message: 'Tenant not found' })

export async function list(deps: Deps, input: AdminInputs['tenants']['list']) {
  const page = pageOffset({ page: input.page ?? 1, pageSize: input.pageSize ?? 20 })
  const { items, total } = await withSystem(deps.db, (trx) =>
    repo.list(trx, { q: input.q, status: input.status }, page),
  )
  return {
    total,
    items: items.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      planCode: row.plan_code,
      planName: row.plan_name,
      status: row.status as Status | null,
      currentPeriodEnd: row.current_period_end,
      memberCount: Number(row.member_count ?? 0),
      createdAt: row.created_at,
    })),
  }
}

export async function get(deps: Deps, input: AdminInputs['tenants']['get']) {
  return withSystem(deps.db, async (trx) => {
    const tenant = await repo.find(trx, input.tenantId)
    if (!tenant) throw notFound()
    const [subscription, members, invoices, auditEvents] = await Promise.all([
      repo.subscription(trx, tenant.id),
      repo.members(trx, tenant.id),
      repo.recentInvoices(trx, tenant.id, 20),
      repo.recentAuditEvents(trx, tenant.id, 50),
    ])
    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        defaultLocale: tenant.default_locale as 'id' | 'en',
        customDomain: tenant.custom_domain,
        createdAt: tenant.created_at,
      },
      subscription: subscription
        ? {
            status: subscription.status as Status,
            currentPeriodEnd: subscription.current_period_end,
            planCode: subscription.plan_code,
            planName: subscription.plan_name,
            price: subscription.price,
            currency: subscription.currency,
            interval: subscription.interval as 'month' | 'year',
          }
        : null,
      members: members.map((m) => ({
        userId: m.user_id,
        email: m.email,
        name: m.name,
        role: m.role as 'owner' | 'admin' | 'member',
        joinedAt: m.created_at,
      })),
      invoices: invoices.map((i) => ({
        id: i.id,
        amount: i.amount,
        currency: i.currency,
        status: i.status as 'open' | 'paid' | 'void',
        dueAt: i.due_at,
        paidAt: i.paid_at,
        createdAt: i.created_at,
      })),
      auditEvents: auditEvents.map((e) => ({
        id: e.id,
        action: e.action,
        actorEmail: e.actor_email,
        targetType: e.target_type,
        targetId: e.target_id,
        metadata: e.metadata as Record<string, unknown>,
        createdAt: e.created_at,
      })),
    }
  })
}

type Change = { before: object; after: object }

/**
 * One transaction per mutation: the business change (a function in core/billing) and exactly one
 * platform audit row. If either fails, neither is kept.
 */
async function audited<R extends Change>(
  deps: Deps,
  admin: User,
  input: { tenantId: string; reason: string },
  action: string,
  run: (trx: Transaction<DB>) => Promise<R>,
  metadata: Record<string, unknown> = {},
): Promise<R> {
  return withSystem(deps.db, async (trx) => {
    const tenant = await repo.find(trx, input.tenantId)
    if (!tenant) throw notFound()
    const change = await run(trx)
    await recordPlatformAudit(trx, {
      actorId: admin.id,
      action,
      reason: input.reason,
      tenantId: tenant.id,
      targetType: 'tenant',
      targetId: tenant.id,
      metadata: { tenant: tenant.slug, ...metadata, before: change.before, after: change.after },
    })
    return change
  })
}

export async function extendTrial(
  deps: Deps,
  admin: User,
  input: AdminInputs['tenants']['extendTrial'],
) {
  const change = await audited(
    deps,
    admin,
    input,
    'tenant.trial_extended',
    (trx) => billing.extendTrial(trx, input.tenantId, input.days),
    { days: input.days },
  )
  return change.after
}

export async function changePlan(
  deps: Deps,
  admin: User,
  input: AdminInputs['tenants']['changePlan'],
) {
  const change = await audited(deps, admin, input, 'tenant.plan_changed', (trx) =>
    billing.changePlan(trx, input.tenantId, input.planCode),
  )
  return change.after
}

export async function setSuspended(
  deps: Deps,
  admin: User,
  input: AdminInputs['tenants']['setSuspended'],
) {
  const change = await audited(
    deps,
    admin,
    input,
    input.suspended ? 'tenant.suspended' : 'tenant.unsuspended',
    (trx) => billing.setSuspended(trx, input.tenantId, input.suspended),
  )
  return change.after
}
