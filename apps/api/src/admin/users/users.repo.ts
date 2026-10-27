import type { DB, Transaction } from '@starter/db'
import { escapeLike } from '../sql'

export async function search(
  trx: Transaction<DB>,
  prefix: string,
  page: { limit: number; offset: number },
) {
  const where = (q: ReturnType<typeof trx.selectFrom<'users'>>) =>
    prefix ? q.where('email', 'ilike', `${escapeLike(prefix)}%`) : q
  const items = await where(trx.selectFrom('users'))
    .select(['id', 'email', 'name', 'created_at'])
    .orderBy('email')
    .limit(page.limit)
    .offset(page.offset)
    .execute()
  const total = await where(trx.selectFrom('users'))
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .executeTakeFirstOrThrow()
  return { items, total: Number(total.n) }
}

export async function find(trx: Transaction<DB>, userId: string) {
  return trx
    .selectFrom('users')
    .select(['id', 'email', 'name', 'locale', 'created_at'])
    .where('id', '=', userId)
    .executeTakeFirst()
}

export async function memberships(trx: Transaction<DB>, userId: string) {
  return trx
    .selectFrom('memberships as m')
    .innerJoin('tenants as t', 't.id', 'm.tenant_id')
    .select(['t.id as tenant_id', 't.name', 't.slug', 'm.role', 'm.created_at'])
    .where('m.user_id', '=', userId)
    .orderBy('m.created_at')
    .execute()
}
