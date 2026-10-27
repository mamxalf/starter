import { oc } from '@orpc/contract'
import { z } from 'zod'
import { Pagination, paginated } from '../shared'
import { Reason } from './shared'

export const FailedJob = z.object({
  id: z.string(),
  queue: z.string(),
  /** Short `key=value` digest of the payload. Secrets and URLs are redacted; it is not the raw payload. */
  payloadSummary: z.string(),
  error: z.string().nullable(),
  failedAt: z.date().nullable(),
  retryCount: z.number().int(),
})

export const jobsContract = {
  /** Newest failure first. */
  listFailed: oc.input(Pagination).output(paginated(FailedJob)),
  /** The job is put back in its queue; the worker runs it again. */
  retry: oc
    .input(z.object({ queue: z.string().min(1), jobId: z.string().min(1), reason: Reason }))
    .output(z.object({ ok: z.literal(true) })),
}
