import { ORPCError } from '@orpc/server'
import { type Database, type DB, newId, type Transaction, withSystem } from '@starter/db'
import { logger } from '@starter/platform/logger'

/**
 * Billing engine for Model 1 (tenants pay the platform).
 * The gateway only turns an invoice into a payment link and reports payment via webhook;
 * everything below (periods, invoices, status, entitlements) is ours.
 *
 *   trialing → active ─(7 days before period end: invoice)─▶ paid → active (next period)
 *                                                          └▶ overdue → past_due
 *                                                             └▶ + grace → suspended (read-only)
 */
export const TRIAL_DAYS = 14
export const INVOICE_LEAD_DAYS = 7
export const GRACE_DAYS = 7

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'suspended' | 'canceled'

const DAY = 24 * 60 * 60 * 1000

export const isWritable = (status: string): boolean =>
  status !== 'suspended' && status !== 'canceled'

export async function startTrial(trx: Transaction<DB>, tenantId: string, now = new Date()) {
  const plan = await trx
    .selectFrom('plans')
    .select('id')
    .where('code', '=', 'pro')
    .executeTakeFirstOrThrow()
  await trx
    .insertInto('subscriptions')
    .values({
      id: newId(),
      tenant_id: tenantId,
      plan_id: plan.id,
      status: 'trialing',
      current_period_end: new Date(now.getTime() + TRIAL_DAYS * DAY),
    })
    .execute()
}

/** Entitlement value for the tenant's current plan, e.g. entitlement(trx, id, 'max_members'). */
export async function entitlement<T = unknown>(
  trx: Transaction<DB>,
  tenantId: string,
  key: string,
): Promise<T | undefined> {
  const row = await trx
    .selectFrom('subscriptions')
    .innerJoin('plan_entitlements', 'plan_entitlements.plan_id', 'subscriptions.plan_id')
    .select('plan_entitlements.value')
    .where('subscriptions.tenant_id', '=', tenantId)
    .where('plan_entitlements.key', '=', key)
    .executeTakeFirst()
  return row?.value as T | undefined
}

/**
 * Daily job: issue renewal invoices and move overdue subscriptions along the lifecycle.
 * Idempotent: running it twice in a day changes nothing the second time.
 */
export async function runBillingCycle(db: Database, now = new Date()) {
  return withSystem(db, async (trx) => {
    const due = await trx
      .selectFrom('subscriptions as s')
      .innerJoin('plans as p', 'p.id', 's.plan_id')
      .select(['s.id', 's.tenant_id', 's.current_period_end', 'p.price', 'p.currency'])
      .where('s.status', 'in', ['trialing', 'active'])
      .where('s.current_period_end', '<=', new Date(now.getTime() + INVOICE_LEAD_DAYS * DAY))
      .where(({ not, exists, selectFrom }) =>
        not(
          exists(
            selectFrom('invoices as i')
              .select('i.id')
              .whereRef('i.subscription_id', '=', 's.id')
              .where('i.status', '=', 'open'),
          ),
        ),
      )
      .execute()

    let invoiced = 0
    for (const sub of due) {
      if (sub.price === 0) continue // free plan: nothing to bill
      await trx
        .insertInto('invoices')
        .values({
          id: newId(),
          tenant_id: sub.tenant_id,
          subscription_id: sub.id,
          amount: sub.price,
          currency: sub.currency,
          status: 'open',
          due_at: sub.current_period_end,
        })
        .execute()
      invoiced++
      // TODO(gateway): create a payment link via PaymentGateway and email it to the owner.
    }

    const pastDue = await trx
      .updateTable('subscriptions')
      .set({ status: 'past_due', updated_at: now })
      .where('status', 'in', ['trialing', 'active'])
      .where('id', 'in', (eb) =>
        eb
          .selectFrom('invoices')
          .select('subscription_id')
          .where('status', '=', 'open')
          .where('due_at', '<', now)
          .where('subscription_id', 'is not', null)
          .$narrowType<{ subscription_id: string }>(),
      )
      .executeTakeFirst()

    const suspended = await trx
      .updateTable('subscriptions')
      .set({ status: 'suspended', updated_at: now })
      .where('status', '=', 'past_due')
      .where('id', 'in', (eb) =>
        eb
          .selectFrom('invoices')
          .select('subscription_id')
          .where('status', '=', 'open')
          .where('due_at', '<', new Date(now.getTime() - GRACE_DAYS * DAY))
          .where('subscription_id', 'is not', null)
          .$narrowType<{ subscription_id: string }>(),
      )
      .executeTakeFirst()

    const result = {
      invoiced,
      pastDue: Number(pastDue.numUpdatedRows),
      suspended: Number(suspended.numUpdatedRows),
    }
    logger.info(result, 'billing cycle done')
    return result
  })
}

/** Called by the payment webhook handler once a gateway confirms payment. */
export async function markInvoicePaid(db: Database, invoiceId: string, now = new Date()) {
  await withSystem(db, async (trx) => {
    const invoice = await trx
      .updateTable('invoices')
      .set({ status: 'paid', paid_at: now, updated_at: now })
      .where('id', '=', invoiceId)
      .where('status', '=', 'open')
      .returning(['subscription_id'])
      .executeTakeFirst()
    if (!invoice?.subscription_id) return // already paid (idempotent) or not a subscription

    const sub = await trx
      .selectFrom('subscriptions as s')
      .innerJoin('plans as p', 'p.id', 's.plan_id')
      .select(['s.current_period_end', 'p.interval'])
      .where('s.id', '=', invoice.subscription_id)
      .executeTakeFirstOrThrow()

    const from = sub.current_period_end > now ? sub.current_period_end : now
    const next = new Date(from)
    if (sub.interval === 'year') next.setUTCFullYear(next.getUTCFullYear() + 1)
    else next.setUTCMonth(next.getUTCMonth() + 1)

    await trx
      .updateTable('subscriptions')
      .set({ status: 'active', current_period_end: next, updated_at: now })
      .where('id', '=', invoice.subscription_id)
      .execute()
  })
}

// ── Platform admin operations ───────────────────────────────────────────
// Called by apps/api/src/admin inside its own transaction (together with the platform audit row).
// Each returns what changed so the caller can record before/after.

const EXTENDABLE: SubscriptionStatus[] = ['trialing', 'past_due', 'suspended']

async function lockSubscription(trx: Transaction<DB>, tenantId: string) {
  const sub = await trx
    .selectFrom('subscriptions')
    .select(['id', 'plan_id', 'status', 'current_period_end'])
    .where('tenant_id', '=', tenantId)
    .forUpdate()
    .executeTakeFirst()
  if (!sub) throw new ORPCError('NOT_FOUND', { message: 'Subscription not found' })
  return sub
}

/**
 * Gives a tenant more time: status becomes `trialing` and the period end moves `days` past the later
 * of now and the current end. Open invoices that would otherwise be overdue move with it, otherwise
 * the next billing cycle would immediately push the subscription back to past_due.
 */
export async function extendTrial(
  trx: Transaction<DB>,
  tenantId: string,
  days: number,
  now = new Date(),
) {
  const sub = await lockSubscription(trx, tenantId)
  if (!EXTENDABLE.includes(sub.status as SubscriptionStatus)) {
    throw new ORPCError('CONFLICT', { message: `Cannot extend a ${sub.status} subscription` })
  }
  const base = sub.current_period_end > now ? sub.current_period_end : now
  const currentPeriodEnd = new Date(base.getTime() + days * DAY)

  await trx
    .updateTable('subscriptions')
    .set({ status: 'trialing', current_period_end: currentPeriodEnd, updated_at: now })
    .where('id', '=', sub.id)
    .execute()
  await trx
    .updateTable('invoices')
    .set({ due_at: currentPeriodEnd, updated_at: now })
    .where('subscription_id', '=', sub.id)
    .where('status', '=', 'open')
    .where('due_at', '<', currentPeriodEnd)
    .execute()

  return {
    before: { status: sub.status, currentPeriodEnd: sub.current_period_end },
    after: { status: 'trialing' as const, currentPeriodEnd },
  }
}

/** Switches plan with no proration: entitlements follow at once, the price applies from the next invoice. */
export async function changePlan(trx: Transaction<DB>, tenantId: string, planCode: string) {
  const plan = await trx
    .selectFrom('plans')
    .select(['id', 'code', 'is_active'])
    .where('code', '=', planCode)
    .executeTakeFirst()
  if (!plan?.is_active) throw new ORPCError('BAD_REQUEST', { message: 'Unknown or inactive plan' })

  const sub = await lockSubscription(trx, tenantId)
  if (sub.plan_id === plan.id) {
    throw new ORPCError('CONFLICT', { message: 'The tenant is already on this plan' })
  }
  const previous = await trx
    .selectFrom('plans')
    .select('code')
    .where('id', '=', sub.plan_id)
    .executeTakeFirstOrThrow()

  await trx
    .updateTable('subscriptions')
    .set({ plan_id: plan.id, updated_at: new Date() })
    .where('id', '=', sub.id)
    .execute()

  return { before: { planCode: previous.code }, after: { planCode: plan.code } }
}

/**
 * Suspend = read-only workspace (see isWritable); unsuspend = `active`. Unsuspending does not forgive
 * open invoices: if one is overdue the next billing cycle suspends again, so use extendTrial instead.
 */
export async function setSuspended(trx: Transaction<DB>, tenantId: string, suspended: boolean) {
  const sub = await lockSubscription(trx, tenantId)
  if (sub.status === 'canceled') {
    throw new ORPCError('CONFLICT', { message: 'The subscription is canceled' })
  }
  if (suspended && sub.status === 'suspended') {
    throw new ORPCError('CONFLICT', { message: 'The tenant is already suspended' })
  }
  if (!suspended && sub.status !== 'suspended') {
    throw new ORPCError('CONFLICT', { message: 'The tenant is not suspended' })
  }

  const status = suspended ? ('suspended' as const) : ('active' as const)
  await trx
    .updateTable('subscriptions')
    .set({ status, updated_at: new Date() })
    .where('id', '=', sub.id)
    .execute()

  return { before: { status: sub.status }, after: { status } }
}
