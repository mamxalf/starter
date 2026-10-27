import { Locale } from '@starter/contracts'
import { defineJob } from '@starter/platform/jobs'
import { z } from 'zod'

/**
 * Job identities + payload schemas. Services enqueue these; the worker registers handlers
 * (jobs/handlers.ts). Tenant jobs carry `tenantId` so the worker restores tenant context.
 */

const EmailPayload = z.discriminatedUnion('template', [
  z.object({
    template: z.literal('invitation'),
    props: z.object({ tenantName: z.string(), inviterName: z.string(), acceptUrl: z.url() }),
  }),
])

export const sendEmailJob = defineJob({
  name: 'email.send',
  schema: z.intersection(
    z.object({
      tenantId: z.uuid().optional(),
      locale: Locale,
      to: z.email(),
      /** Display name in From, e.g. "Acme via App". */
      fromName: z.string().optional(),
      replyTo: z.email().optional(),
    }),
    EmailPayload,
  ),
  retryLimit: 5,
})

export const billingCycleJob = defineJob({
  name: 'billing.cycle',
  schema: z.object({}),
  cron: '15 1 * * *', // daily 01:15 UTC
})

export const cleanupUploadsJob = defineJob({
  name: 'files.cleanup',
  schema: z.object({}),
  cron: '7 * * * *', // hourly
})
