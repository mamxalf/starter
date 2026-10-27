import { ORPCError } from '@orpc/server'
import type { AdminInputs } from '@starter/contracts/admin'
import { withSystem } from '@starter/db'
import type { User } from '../../core/users'
import type { Deps } from '../../deps'
import { recordPlatformAudit } from '../platform-audit'

const SECRET_KEY = /url|token|secret|password|key|authorization/i
const MAX_VALUE = 60

/**
 * One-line digest of a job payload for the back-office: top-level fields only, long strings cut,
 * and anything that looks like a credential or link (invite URLs carry tokens) replaced.
 */
export function summarizePayload(payload: unknown): string {
  if (payload === null || typeof payload !== 'object') return String(payload ?? '')
  return Object.entries(payload as Record<string, unknown>)
    .map(([key, value]) => {
      if (SECRET_KEY.test(key)) return `${key}=[redacted]`
      if (value !== null && typeof value === 'object') return `${key}={…}`
      const text = String(value)
      return `${key}=${text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE)}…` : text}`
    })
    .join(' ')
}

export async function listFailed(deps: Deps, input: AdminInputs['jobs']['listFailed']) {
  const page = input.page ?? 1
  const pageSize = input.pageSize ?? 20
  const all = await deps.jobAdmin.listFailed()
  return {
    total: all.length,
    items: all.slice((page - 1) * pageSize, page * pageSize).map((job) => ({
      id: job.id,
      queue: job.queue,
      payloadSummary: summarizePayload(job.payload),
      error: job.error,
      failedAt: job.failedAt,
      retryCount: job.retryCount,
    })),
  }
}

/**
 * The queue lives in its own connection, so the audit row cannot share a transaction with the retry.
 * It is written first and the retry runs inside the same transaction: a refused or failed retry rolls
 * the row back, and a retry is never performed without its audit row.
 */
export async function retry(deps: Deps, admin: User, input: AdminInputs['jobs']['retry']) {
  await withSystem(deps.db, async (trx) => {
    await recordPlatformAudit(trx, {
      actorId: admin.id,
      action: 'job.retried',
      reason: input.reason,
      targetType: 'job',
      targetId: input.jobId,
      metadata: { queue: input.queue },
    })
    const result = await deps.jobAdmin.retry(input.queue, input.jobId)
    if (result === 'not_found') throw new ORPCError('NOT_FOUND', { message: 'Job not found' })
    if (result === 'not_failed') {
      throw new ORPCError('CONFLICT', { message: 'Only failed jobs can be retried' })
    }
  })
  return { ok: true as const }
}
