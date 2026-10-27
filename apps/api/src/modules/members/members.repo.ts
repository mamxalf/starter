import type { DB, Transaction } from '@starter/db'

export type MemberRow = {
  user_id: string
  email: string
  name: string | null
  role: string
  created_at: Date
}

const columns = [
  'memberships.user_id',
  'users.email',
  'users.name',
  'memberships.role',
  'memberships.created_at',
] as const

export async function list(trx: Transaction<DB>, tenantId: string): Promise<MemberRow[]> {
  return trx
    .selectFrom('memberships')
    .innerJoin('users', 'users.id', 'memberships.user_id')
    .select(columns)
    .where('memberships.tenant_id', '=', tenantId)
    .orderBy('memberships.created_at')
    .execute()
}

/** Row-locked, so concurrent role changes and removals on the same member serialize. */
export async function findForUpdate(
  trx: Transaction<DB>,
  tenantId: string,
  userId: string,
): Promise<MemberRow | undefined> {
  return trx
    .selectFrom('memberships')
    .innerJoin('users', 'users.id', 'memberships.user_id')
    .select(columns)
    .where('memberships.tenant_id', '=', tenantId)
    .where('memberships.user_id', '=', userId)
    .forUpdate('memberships')
    .executeTakeFirst()
}

export async function updateRole(
  trx: Transaction<DB>,
  tenantId: string,
  userId: string,
  role: string,
): Promise<void> {
  await trx
    .updateTable('memberships')
    .set({ role, updated_at: new Date() })
    .where('tenant_id', '=', tenantId)
    .where('user_id', '=', userId)
    .execute()
}

export async function remove(
  trx: Transaction<DB>,
  tenantId: string,
  userId: string,
): Promise<void> {
  await trx
    .deleteFrom('memberships')
    .where('tenant_id', '=', tenantId)
    .where('user_id', '=', userId)
    .execute()
}
