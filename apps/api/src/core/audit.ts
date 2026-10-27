import type { DB } from '@starter/db'
import { newId, type Transaction } from '@starter/db'
import { getContext } from '@starter/platform/context'

/**
 * Who did what, per tenant. Actor comes from the request context automatically.
 * Call from services, inside the same transaction as the change it records.
 */
export async function recordAudit(
  trx: Transaction<DB>,
  tenantId: string,
  event: {
    action: string
    targetType?: string
    targetId?: string
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  await trx
    .insertInto('audit_events')
    .values({
      id: newId(),
      tenant_id: tenantId,
      actor_id: getContext()?.userId ?? null,
      action: event.action,
      target_type: event.targetType ?? null,
      target_id: event.targetId ?? null,
      metadata: JSON.stringify(event.metadata ?? {}),
    })
    .execute()
}
