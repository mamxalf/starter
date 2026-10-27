import { oc } from '@orpc/contract'
import { z } from 'zod'
import { Pagination, paginated } from '../shared'

export const PlatformAuditEvent = z.object({
  id: z.uuid(),
  actorId: z.uuid().nullable(),
  actorEmail: z.string().nullable(),
  action: z.string(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  tenantId: z.uuid().nullable(),
  reason: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.date(),
})

export const auditContract = {
  /** Newest first. */
  list: oc.input(Pagination).output(paginated(PlatformAuditEvent)),
}
