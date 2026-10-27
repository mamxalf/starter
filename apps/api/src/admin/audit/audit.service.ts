import type { AdminInputs } from '@starter/contracts/admin'
import { withSystem } from '@starter/db'
import type { Deps } from '../../deps'
import { pageOffset } from '../sql'

export async function list(deps: Deps, input: AdminInputs['audit']['list']) {
  const { limit, offset } = pageOffset({ page: input.page ?? 1, pageSize: input.pageSize ?? 20 })
  const { rows, total } = await withSystem(deps.db, async (trx) => {
    const rows = await trx
      .selectFrom('platform_audit_events as e')
      .leftJoin('users as u', 'u.id', 'e.actor_id')
      .select([
        'e.id',
        'e.actor_id',
        'u.email as actor_email',
        'e.action',
        'e.target_type',
        'e.target_id',
        'e.tenant_id',
        'e.reason',
        'e.metadata',
        'e.created_at',
      ])
      .orderBy('e.created_at', 'desc')
      .orderBy('e.id', 'desc')
      .limit(limit)
      .offset(offset)
      .execute()
    const total = await trx
      .selectFrom('platform_audit_events')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .executeTakeFirstOrThrow()
    return { rows, total: Number(total.n) }
  })
  return {
    total,
    items: rows.map((e) => ({
      id: e.id,
      actorId: e.actor_id,
      actorEmail: e.actor_email,
      action: e.action,
      targetType: e.target_type,
      targetId: e.target_id,
      tenantId: e.tenant_id,
      reason: e.reason,
      metadata: e.metadata as Record<string, unknown>,
      createdAt: e.created_at,
    })),
  }
}
