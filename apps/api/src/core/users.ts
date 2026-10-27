import { ORPCError } from '@orpc/server'
import type { AuthPort, ExternalIdentity } from '@starter/auth'
import { type Database, newId, type Selectable, type Users } from '@starter/db'

export type User = Selectable<Users>

/**
 * Maps a provider identity to OUR user, creating or linking on first sight.
 * Provider-agnostic: works the same for Clerk, Better Auth or anything behind AuthPort.
 *
 * Linking to an existing user by email only happens when the provider says the email
 * is verified; otherwise an attacker could claim someone else's account by email.
 */
export async function resolveUser(
  db: Database,
  auth: AuthPort,
  identity: ExternalIdentity,
): Promise<User> {
  const known = await findByIdentity(db, auth.provider, identity.externalId)
  if (known) return known

  const profile = await auth.getProfile(identity.externalId)
  if (!profile) throw new ORPCError('UNAUTHORIZED', { message: 'Unknown identity' })

  return db.transaction().execute(async (trx) => {
    const existing = await trx
      .selectFrom('users')
      .selectAll()
      .where('email', '=', profile.email)
      .executeTakeFirst()

    if (existing && !profile.emailVerified) {
      throw new ORPCError('FORBIDDEN', {
        message: 'Verify your email address to sign in to this account',
      })
    }

    const user =
      existing ??
      (await trx
        .insertInto('users')
        .values({ id: newId(), email: profile.email, name: profile.name ?? null })
        .returningAll()
        .executeTakeFirstOrThrow())

    await trx
      .insertInto('auth_identities')
      .values({
        id: newId(),
        user_id: user.id,
        provider: auth.provider,
        external_id: identity.externalId,
      })
      .onConflict((oc) => oc.columns(['provider', 'external_id']).doNothing())
      .execute()

    return user
  })
}

async function findByIdentity(
  db: Database,
  provider: string,
  externalId: string,
): Promise<User | undefined> {
  return db
    .selectFrom('auth_identities')
    .innerJoin('users', 'users.id', 'auth_identities.user_id')
    .selectAll('users')
    .where('auth_identities.provider', '=', provider)
    .where('auth_identities.external_id', '=', externalId)
    .executeTakeFirst()
}
