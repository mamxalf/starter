import { ORPCError } from '@orpc/server'
import type { Inputs, Outputs, Role } from '@starter/contracts'
import { recordAudit } from '../../core/audit'
import { authorize, policy } from '../../core/policy'
import type { User } from '../../core/users'
import type { TenantScope } from '../../orpc'
import * as repo from './members.repo'

type Member = Outputs['members']['list'][number]

/** Row → API shape. Keeps DB column names out of the contract. */
const toMember = (row: repo.MemberRow): Member => ({
  userId: row.user_id,
  email: row.email,
  name: row.name,
  role: row.role as Role,
  joinedAt: row.created_at,
})

const notFound = () => new ORPCError('NOT_FOUND', { message: 'Member not found' })

export async function list(scope: TenantScope) {
  const rows = await scope.tx((trx) => repo.list(trx, scope.tenant.id))
  return rows.map(toMember)
}

export async function changeRole(scope: TenantScope, input: Inputs['members']['changeRole']) {
  return scope.tx(async (trx) => {
    const target = await repo.findForUpdate(trx, scope.tenant.id, input.userId)
    if (!target) throw notFound()
    authorize(
      policy.manageMember(scope.role, target.role as Role),
      'Not allowed to change this member',
    )
    authorize(policy.assignRole(scope.role, input.role), 'Only the owner can grant the admin role')
    if (target.role === input.role) return toMember(target)

    await repo.updateRole(trx, scope.tenant.id, target.user_id, input.role)
    await recordAudit(trx, scope.tenant.id, {
      action: 'member.role_changed',
      targetType: 'user',
      targetId: target.user_id,
      metadata: { from: target.role, to: input.role },
    })
    return toMember({ ...target, role: input.role })
  })
}

export async function remove(scope: TenantScope, input: Inputs['members']['remove']) {
  await scope.tx(async (trx) => {
    const target = await repo.findForUpdate(trx, scope.tenant.id, input.userId)
    if (!target) throw notFound()
    authorize(
      policy.manageMember(scope.role, target.role as Role),
      'Not allowed to remove this member',
    )

    await repo.remove(trx, scope.tenant.id, target.user_id)
    await recordAudit(trx, scope.tenant.id, {
      action: 'member.removed',
      targetType: 'user',
      targetId: target.user_id,
    })
  })
  return { ok: true as const }
}

export async function leave(scope: TenantScope, user: User) {
  authorize(policy.leaveTenant(scope.role), 'Transfer ownership before leaving')
  await scope.tx(async (trx) => {
    await repo.remove(trx, scope.tenant.id, user.id)
    await recordAudit(trx, scope.tenant.id, {
      action: 'member.left',
      targetType: 'user',
      targetId: user.id,
    })
  })
  return { ok: true as const }
}

/** One transaction: the old owner becomes admin, the target becomes owner. Never zero or two owners. */
export async function transferOwnership(
  scope: TenantScope,
  user: User,
  input: Inputs['members']['transferOwnership'],
) {
  authorize(policy.transferOwnership(scope.role), 'Only the owner can transfer ownership')
  if (input.userId === user.id) {
    throw new ORPCError('BAD_REQUEST', { message: 'You already own this workspace' })
  }

  await scope.tx(async (trx) => {
    // Lock in a fixed order so two concurrent transfers cannot deadlock.
    const [first, second] = [user.id, input.userId].sort()
    const a = await repo.findForUpdate(trx, scope.tenant.id, first as string)
    const b = await repo.findForUpdate(trx, scope.tenant.id, second as string)
    const current = [a, b].find((row) => row?.user_id === user.id)
    const target = [a, b].find((row) => row?.user_id === input.userId)

    // Re-checked under the lock: a concurrent transfer may already have moved ownership.
    if (current?.role !== 'owner') {
      throw new ORPCError('FORBIDDEN', { message: 'Only the owner can transfer ownership' })
    }
    if (!target) throw notFound()

    await repo.updateRole(trx, scope.tenant.id, current.user_id, 'admin')
    await repo.updateRole(trx, scope.tenant.id, target.user_id, 'owner')
    await recordAudit(trx, scope.tenant.id, {
      action: 'ownership.transferred',
      targetType: 'user',
      targetId: target.user_id,
      metadata: { from: current.user_id },
    })
  })
  return { ok: true as const }
}
