import { type DB, newId, type Selectable, type Tenants, type Transaction } from '@starter/db'

export async function insertTenant(
  trx: Transaction<DB>,
  values: { id: string; slug: string; name: string; defaultLocale: string },
): Promise<Selectable<Tenants>> {
  return trx
    .insertInto('tenants')
    .values({
      id: values.id,
      slug: values.slug,
      name: values.name,
      default_locale: values.defaultLocale,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function insertMembership(
  trx: Transaction<DB>,
  tenantId: string,
  userId: string,
  role: string,
): Promise<void> {
  await trx
    .insertInto('memberships')
    .values({ id: newId(), tenant_id: tenantId, user_id: userId, role })
    .onConflict((oc) => oc.columns(['tenant_id', 'user_id']).doNothing())
    .execute()
}

export async function countSeats(trx: Transaction<DB>, tenantId: string): Promise<number> {
  const [members, invites] = await Promise.all([
    trx
      .selectFrom('memberships')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('tenant_id', '=', tenantId)
      .executeTakeFirstOrThrow(),
    trx
      .selectFrom('invitations')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('tenant_id', '=', tenantId)
      .where('accepted_at', 'is', null)
      .where('expires_at', '>', new Date())
      .executeTakeFirstOrThrow(),
  ])
  return Number(members.n) + Number(invites.n)
}

/** Confirmed members only (no pending invitations). */
export async function countMembers(trx: Transaction<DB>, tenantId: string): Promise<number> {
  const row = await trx
    .selectFrom('memberships')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('tenant_id', '=', tenantId)
    .executeTakeFirstOrThrow()
  return Number(row.n)
}

export async function insertInvitation(
  trx: Transaction<DB>,
  values: {
    tenantId: string
    email: string
    role: string
    token: string
    invitedBy: string
    expiresAt: Date
  },
) {
  return trx
    .insertInto('invitations')
    .values({
      id: newId(),
      tenant_id: values.tenantId,
      email: values.email,
      role: values.role,
      token: values.token,
      invited_by: values.invitedBy,
      expires_at: values.expiresAt,
    })
    .returning(['id', 'email', 'role', 'expires_at'])
    .executeTakeFirstOrThrow()
}

export async function listOpenInvitations(trx: Transaction<DB>, tenantId: string) {
  return trx
    .selectFrom('invitations')
    .select(['id', 'email', 'role', 'expires_at'])
    .where('tenant_id', '=', tenantId)
    .where('accepted_at', 'is', null)
    .where('expires_at', '>', new Date())
    .orderBy('created_at', 'desc')
    .execute()
}

export async function findOpenInvitationByToken(trx: Transaction<DB>, token: string) {
  return trx
    .selectFrom('invitations')
    .selectAll()
    .where('token', '=', token)
    .where('accepted_at', 'is', null)
    .where('expires_at', '>', new Date())
    .executeTakeFirst()
}

export async function markInvitationAccepted(trx: Transaction<DB>, id: string): Promise<void> {
  await trx
    .updateTable('invitations')
    .set({ accepted_at: new Date(), updated_at: new Date() })
    .where('id', '=', id)
    .execute()
}

export async function deleteOpenInvitation(
  trx: Transaction<DB>,
  tenantId: string,
  id: string,
): Promise<boolean> {
  const result = await trx
    .deleteFrom('invitations')
    .where('tenant_id', '=', tenantId)
    .where('id', '=', id)
    .where('accepted_at', 'is', null)
    .executeTakeFirst()
  return Number(result.numDeletedRows) > 0
}

/** New token + expiry for an open invitation; the previous link stops working. */
export async function refreshOpenInvitation(
  trx: Transaction<DB>,
  tenantId: string,
  id: string,
  values: { token: string; expiresAt: Date },
) {
  return trx
    .updateTable('invitations')
    .set({ token: values.token, expires_at: values.expiresAt, updated_at: new Date() })
    .where('tenant_id', '=', tenantId)
    .where('id', '=', id)
    .where('accepted_at', 'is', null)
    .where('expires_at', '>', new Date())
    .returning(['id', 'email', 'role', 'expires_at'])
    .executeTakeFirst()
}
