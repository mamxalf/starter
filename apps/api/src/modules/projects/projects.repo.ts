import { type DB, newId, type Projects, type Selectable, type Transaction } from '@starter/db'

/**
 * Data access only. Every query filters by tenant_id explicitly (layer 1);
 * RLS checks it again underneath (layer 2). Callers pass a tenant-scoped transaction.
 */
export type ProjectRow = Selectable<Projects>

export async function list(
  trx: Transaction<DB>,
  tenantId: string,
  opts: { page: number; pageSize: number; q?: string },
) {
  let query = trx.selectFrom('projects').where('tenant_id', '=', tenantId)
  if (opts.q) query = query.where('name', 'ilike', `%${opts.q.replace(/[%_\\]/g, '\\$&')}%`)

  const [items, count] = await Promise.all([
    query
      .selectAll()
      .orderBy('created_at', 'desc')
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize)
      .execute(),
    query.select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirstOrThrow(),
  ])
  return { items, total: Number(count.n) }
}

export function find(trx: Transaction<DB>, tenantId: string, id: string) {
  return trx
    .selectFrom('projects')
    .selectAll()
    .where('tenant_id', '=', tenantId)
    .where('id', '=', id)
    .executeTakeFirst()
}

export function insert(
  trx: Transaction<DB>,
  tenantId: string,
  values: { name: string; description: string | null },
) {
  return trx
    .insertInto('projects')
    .values({ id: newId(), tenant_id: tenantId, ...values })
    .returningAll()
    .executeTakeFirstOrThrow()
}

export function update(
  trx: Transaction<DB>,
  tenantId: string,
  id: string,
  values: { name: string; description: string | null },
) {
  return trx
    .updateTable('projects')
    .set({ ...values, updated_at: new Date() })
    .where('tenant_id', '=', tenantId)
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst()
}

export async function remove(trx: Transaction<DB>, tenantId: string, id: string) {
  const result = await trx
    .deleteFrom('projects')
    .where('tenant_id', '=', tenantId)
    .where('id', '=', id)
    .executeTakeFirst()
  return Number(result.numDeletedRows) > 0
}
