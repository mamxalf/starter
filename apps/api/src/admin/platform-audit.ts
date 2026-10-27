import { type DB, newId, type Transaction } from '@starter/db'

/**
 * Appends to platform_audit_events. Call it in the same transaction as the change it records, once per
 * mutation; the actor is passed explicitly (never inferred) and `reason` is mandatory.
 */
export async function recordPlatformAudit(
  trx: Transaction<DB>,
  event: {
    actorId: string
    action: string
    reason: string
    tenantId?: string
    targetType?: string
    targetId?: string
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  await trx
    .insertInto('platform_audit_events')
    .values({
      id: newId(),
      actor_id: event.actorId,
      action: event.action,
      reason: event.reason,
      tenant_id: event.tenantId ?? null,
      target_type: event.targetType ?? null,
      target_id: event.targetId ?? null,
      metadata: JSON.stringify(event.metadata ?? {}),
    })
    .execute()
}
