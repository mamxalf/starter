import { implement, ORPCError } from '@orpc/server'
import { adminContract } from '@starter/contracts/admin'
import { updateContext } from '@starter/platform/context'
import { resolveUser } from '../core/users'
import type { Deps } from '../deps'

export type AdminBaseContext = {
  deps: Deps
  /** Web Request (headers + url), same shape as the tenant API. */
  request: Request
}

export const adminBase = implement(adminContract).$context<AdminBaseContext>()

/** Every refusal looks the same: this API must not reveal that it exists. */
const hidden = () => new ORPCError('NOT_FOUND', { message: 'Not found' })

/**
 * Gate for every admin procedure, in order: admin API enabled → Cloudflare Access (if configured)
 * → signed-in identity → verified email on the PLATFORM_ADMINS allowlist.
 *
 * The email must be verified: resolveUser creates a new user from an unverified email when nobody
 * owns it yet, so without this check anyone could sign up as an allowlisted address.
 * Platform admins are not tenant memberships.
 */
export const platformAdmin = adminBase.use(async ({ context, next }) => {
  const { deps, request } = context
  const { platformAdmins, verifyAccess } = deps.admin
  if (platformAdmins.length === 0) throw hidden()
  if (verifyAccess && !(await verifyAccess(request))) throw hidden()

  const identity = await deps.auth.authenticate(request)
  if (!identity) throw hidden()

  let user: Awaited<ReturnType<typeof resolveUser>>
  try {
    user = await resolveUser(deps.db, deps.auth, identity)
  } catch (error) {
    if (error instanceof ORPCError) throw hidden()
    throw error
  }

  const profile = await deps.auth.getProfile(identity.externalId)
  if (!profile?.emailVerified || !platformAdmins.includes(profile.email.toLowerCase())) {
    throw hidden()
  }

  updateContext({ userId: user.id })
  return next({ context: { user } })
})
