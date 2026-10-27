import type { DB, Transaction } from '@starter/db'
import { escapeLike } from '../sql'

type Filters = { q?: string; status?: string }

const filtered = (trx: Transaction<DB>, filters: Filters) => {
  let query = trx
    .selectFrom('tenants as t')
    .leftJoin('subscriptions as s', 's.tenant_id', 't.id')
    .leftJoin('plans as p', 'p.id', 's.plan_id')
  if (filters.q) {
    const pattern = `%${escapeLike(filters.q)}%`
    query = query.where((eb) =>
      eb.or([eb('t.name', 'ilike', pattern), eb('t.slug', 'ilike', pattern)]),
    )
  }
  if (filters.status) query = query.where('s.status', '=', filters.status)
  return query
}

export async function list(
  trx: Transaction<DB>,
  filters: Filters,
  page: { limit: number; offset: number },
) {
  const items = await filtered(trx, filters)
    .select([
      't.id',
      't.name',
      't.slug',
      't.created_at',
      'p.code as plan_code',
      'p.name as plan_name',
      's.status',
      's.current_period_end',
    ])
    .select((eb) =>
      eb
        .selectFrom('memberships as m')
        .select(eb.fn.countAll<string>().as('n'))
        .whereRef('m.tenant_id', '=', 't.id')
        .as('member_count'),
    )
    .orderBy('t.created_at', 'desc')
    .orderBy('t.id')
    .limit(page.limit)
    .offset(page.offset)
    .execute()
  const total = await filtered(trx, filters)
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .executeTakeFirstOrThrow()
  return { items, total: Number(total.n) }
}

export async function find(trx: Transaction<DB>, tenantId: string) {
  return trx.selectFrom('tenants').selectAll().where('id', '=', tenantId).executeTakeFirst()
}

export async function subscription(trx: Transaction<DB>, tenantId: string) {
  return trx
    .selectFrom('subscriptions as s')
    .innerJoin('plans as p', 'p.id', 's.plan_id')
    .select([
      's.status',
      's.current_period_end',
      'p.code as plan_code',
      'p.name as plan_name',
      'p.price',
      'p.currency',
      'p.interval',
    ])
    .where('s.tenant_id', '=', tenantId)
    .executeTakeFirst()
}

export async function members(trx: Transaction<DB>, tenantId: string) {
  return trx
    .selectFrom('memberships as m')
    .innerJoin('users as u', 'u.id', 'm.user_id')
    .select(['m.user_id', 'u.email', 'u.name', 'm.role', 'm.created_at'])
    .where('m.tenant_id', '=', tenantId)
    .orderBy('m.created_at')
    .execute()
}

export async function recentInvoices(trx: Transaction<DB>, tenantId: string, limit: number) {
  return trx
    .selectFrom('invoices')
    .select(['id', 'amount', 'currency', 'status', 'due_at', 'paid_at', 'created_at'])
    .where('tenant_id', '=', tenantId)
    .orderBy('created_at', 'desc')
    .limit(limit)
    .execute()
}

export async function recentAuditEvents(trx: Transaction<DB>, tenantId: string, limit: number) {
  return trx
    .selectFrom('audit_events as a')
    .leftJoin('users as u', 'u.id', 'a.actor_id')
    .select([
      'a.id',
      'a.action',
      'u.email as actor_email',
      'a.target_type',
      'a.target_id',
      'a.metadata',
      'a.created_at',
    ])
    .where('a.tenant_id', '=', tenantId)
    .orderBy('a.created_at', 'desc')
    .limit(limit)
    .execute()
}
