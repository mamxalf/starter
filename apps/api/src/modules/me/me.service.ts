import type { Locale, Outputs, Role } from '@starter/contracts'
import { type Database, withSystem } from '@starter/db'
import type { User } from '../../core/users'

export async function getMe(db: Database, user: User): Promise<Outputs['me']['get']> {
  // Memberships span tenants, so this read is a deliberate, narrow RLS bypass.
  const memberships = await withSystem(db, (trx) =>
    trx
      .selectFrom('memberships as m')
      .innerJoin('tenants as t', 't.id', 'm.tenant_id')
      .select(['t.id as tenantId', 't.slug', 't.name', 'm.role'])
      .where('m.user_id', '=', user.id)
      .orderBy('t.name')
      .execute(),
  )
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      locale: (user.locale as Locale | null) ?? null,
    },
    memberships: memberships.map((m) => ({ ...m, role: m.role as Role })),
  }
}

export async function updateLocale(db: Database, userId: string, locale: Locale): Promise<void> {
  await db
    .updateTable('users')
    .set({ locale, updated_at: new Date() })
    .where('id', '=', userId)
    .execute()
}
