import { randomBytes } from 'node:crypto'
import { ORPCError } from '@orpc/server'
import type { Inputs, Locale, Outputs } from '@starter/contracts'
import { newId, type Selectable, type Tenants, withSystem, withTenant } from '@starter/db'
import { recordAudit } from '../../core/audit'
import { entitlement, startTrial } from '../../core/billing'
import { isUniqueViolation } from '../../core/errors'
import { authorize, policy } from '../../core/policy'
import type { User } from '../../core/users'
import type { Deps } from '../../deps'
import { sendEmailJob } from '../../jobs/definitions'
import type { TenantScope } from '../../orpc'
import * as repo from './tenants.repo'

const INVITE_TTL_DAYS = 7

export function toTenant(t: Selectable<Tenants>): Outputs['tenants']['create'] {
  return { id: t.id, slug: t.slug, name: t.name, defaultLocale: t.default_locale as Locale }
}

/** New tenant: caller becomes owner, subscription starts as a trial. One transaction. */
export async function createTenant(deps: Deps, user: User, input: Inputs['tenants']['create']) {
  const id = newId()
  try {
    const tenant = await withTenant(deps.db, id, async (trx) => {
      const tenant = await repo.insertTenant(trx, { id, ...input })
      await repo.insertMembership(trx, id, user.id, 'owner')
      await startTrial(trx, id)
      await recordAudit(trx, id, { action: 'tenant.created', targetType: 'tenant', targetId: id })
      return tenant
    })
    return toTenant(tenant)
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ORPCError('CONFLICT', { message: 'That address is already taken' })
    }
    throw error
  }
}

export async function invite(
  deps: Deps,
  scope: TenantScope,
  user: User,
  input: Inputs['tenants']['invite'],
) {
  authorize(policy.inviteMembers(scope.role), 'Only admins can invite members')
  const token = randomBytes(32).toString('base64url')
  const email = input.email.toLowerCase()

  const invitation = await scope.tx(async (trx) => {
    const maxMembers = await entitlement<number>(trx, scope.tenant.id, 'max_members')
    if (maxMembers !== undefined && (await repo.countSeats(trx, scope.tenant.id)) >= maxMembers) {
      throw new ORPCError('FORBIDDEN', { message: 'Member limit reached for your plan' })
    }
    const created = await repo.insertInvitation(trx, {
      tenantId: scope.tenant.id,
      email,
      role: input.role,
      token,
      invitedBy: user.id,
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
    })
    await recordAudit(trx, scope.tenant.id, {
      action: 'member.invited',
      targetType: 'invitation',
      targetId: created.id,
      metadata: { email, role: input.role },
    })
    return created
  })

  await deps.queue.enqueue(sendEmailJob, {
    tenantId: scope.tenant.id,
    locale: scope.locale,
    to: email,
    fromName: `${scope.tenant.name} via ${deps.config.mailFrom.split('<')[0]?.trim() || 'App'}`,
    replyTo: user.email,
    template: 'invitation',
    props: {
      tenantName: scope.tenant.name,
      inviterName: user.name ?? user.email,
      acceptUrl: `${deps.config.appUrl}/invite/${token}`,
    },
  })

  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role as 'admin' | 'member',
    expiresAt: invitation.expires_at,
  }
}

export async function listInvitations(scope: TenantScope) {
  const rows = await scope.tx((trx) => repo.listOpenInvitations(trx, scope.tenant.id))
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role as 'admin' | 'member',
    expiresAt: r.expires_at,
  }))
}

/** The token is the credential, but it only works for the invited email address. */
export async function acceptInvitation(deps: Deps, user: User, token: string) {
  const invitation = await withSystem(deps.db, (trx) => repo.findOpenInvitationByToken(trx, token))
  if (!invitation) throw new ORPCError('NOT_FOUND', { message: 'Invitation not found or expired' })
  if (invitation.email !== user.email.toLowerCase()) {
    throw new ORPCError('FORBIDDEN', { message: 'This invitation was sent to another email' })
  }

  const tenant = await withTenant(deps.db, invitation.tenant_id, async (trx) => {
    await repo.insertMembership(trx, invitation.tenant_id, user.id, invitation.role)
    await repo.markInvitationAccepted(trx, invitation.id)
    await recordAudit(trx, invitation.tenant_id, {
      action: 'member.joined',
      targetType: 'user',
      targetId: user.id,
    })
    return trx
      .selectFrom('tenants')
      .selectAll()
      .where('id', '=', invitation.tenant_id)
      .executeTakeFirstOrThrow()
  })
  return toTenant(tenant)
}
