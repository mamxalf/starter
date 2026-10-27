import { ORPCError } from '@orpc/server'
import type { AdminInputs } from '@starter/contracts/admin'
import { withSystem } from '@starter/db'
import type { Deps } from '../../deps'
import { pageOffset } from '../sql'
import * as repo from './users.repo'

export async function search(deps: Deps, input: AdminInputs['users']['search']) {
  const page = pageOffset({ page: input.page ?? 1, pageSize: input.pageSize ?? 20 })
  const { items, total } = await withSystem(deps.db, (trx) =>
    repo.search(trx, (input.q ?? '').trim(), page),
  )
  return {
    total,
    items: items.map((u) => ({ id: u.id, email: u.email, name: u.name, createdAt: u.created_at })),
  }
}

export async function get(deps: Deps, input: AdminInputs['users']['get']) {
  return withSystem(deps.db, async (trx) => {
    const user = await repo.find(trx, input.userId)
    if (!user) throw new ORPCError('NOT_FOUND', { message: 'User not found' })
    const memberships = await repo.memberships(trx, user.id)
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        locale: user.locale,
        createdAt: user.created_at,
      },
      memberships: memberships.map((m) => ({
        tenantId: m.tenant_id,
        tenantName: m.name,
        tenantSlug: m.slug,
        role: m.role as 'owner' | 'admin' | 'member',
        joinedAt: m.created_at,
      })),
    }
  })
}
