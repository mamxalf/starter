import { newId, withSystem } from '@starter/db'
import { handle, type JobRegistration } from '@starter/platform/jobs'
import { logger } from '@starter/platform/logger'
import { runBillingCycle } from '../core/billing'
import type { Deps } from '../deps'
import { renderEmail } from '../emails'
import { cleanupPendingUploads } from '../modules/files/files.service'
import { billingCycleJob, cleanupUploadsJob, sendEmailJob } from './definitions'

/** Every job the worker runs. Tests pass the same list to inlineQueue(). */
export function jobHandlers(deps: Deps): JobRegistration[] {
  return [
    handle(sendEmailJob, async (data) => {
      const { subject, html, text } = await renderEmail(data, data.locale)
      try {
        const result = await deps.mailer.send({
          to: data.to,
          subject,
          html,
          text,
          fromName: data.fromName,
          replyTo: data.replyTo,
        })
        await logEmail(deps, data, 'sent', result.id)
      } catch (error) {
        await logEmail(deps, data, 'failed', undefined, String(error))
        throw error // let the queue retry
      }
    }),

    handle(billingCycleJob, async () => {
      await runBillingCycle(deps.db)
    }),

    handle(cleanupUploadsJob, async () => {
      const removed = await cleanupPendingUploads(deps)
      logger.info({ removed }, 'pending uploads cleaned')
    }),
  ]
}

async function logEmail(
  deps: Deps,
  data: { tenantId?: string; template: string; to: string },
  status: 'sent' | 'failed',
  providerId?: string,
  error?: string,
) {
  await withSystem(deps.db, (trx) =>
    trx
      .insertInto('email_log')
      .values({
        id: newId(),
        tenant_id: data.tenantId ?? null,
        template: data.template,
        recipient: data.to,
        status,
        provider_id: providerId ?? null,
        error: error ?? null,
      })
      .execute(),
  )
}
