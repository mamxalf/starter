import { randomUUID } from 'node:crypto'
import { PgBoss } from 'pg-boss'
import type { z } from 'zod'
import { getContext, runWithContext } from '../context'
import { logger } from '../logger'

/**
 * A job's identity and payload schema. Enqueuers only need this (not the handler),
 * so business code never imports worker-side dependencies.
 */
export type JobDefinition<S extends z.ZodType = z.ZodType> = {
  name: string
  schema: S
  /** Cron expression (UTC) for recurring jobs; their payload must accept `{}`. */
  cron?: string
  retryLimit?: number
}

export function defineJob<S extends z.ZodType>(definition: JobDefinition<S>): JobDefinition<S> {
  return definition
}

/** A definition plus the function that runs it (registered by the worker). */
export type JobRegistration<S extends z.ZodType = z.ZodType> = {
  job: JobDefinition<S>
  handler: (data: z.infer<S>) => Promise<void>
}

export function handle<S extends z.ZodType>(
  job: JobDefinition<S>,
  handler: (data: z.infer<S>) => Promise<void>,
): JobRegistration {
  return { job, handler } as JobRegistration
}

/** Port: business code enqueues through this, never through pg-boss directly. */
export interface JobQueue {
  enqueue<S extends z.ZodType>(job: JobDefinition<S>, data: z.input<S>): Promise<void>
}

export type FailedJob = {
  id: string
  queue: string
  payload: unknown
  error: string | null
  failedAt: Date | null
  retryCount: number
}

export type RetryResult = 'retried' | 'not_found' | 'not_failed'

/** Port for the platform back-office: look at failed jobs and put one back in the queue. */
export interface JobAdmin {
  /** Failed jobs of every queue, newest first. Adapters may cap how far back they look. */
  listFailed(): Promise<FailedJob[]>
  retry(queue: string, jobId: string): Promise<RetryResult>
}

/** pg-boss has no state filter on findJobs(), so scanning is bounded per queue. */
const SCAN_LIMIT_PER_QUEUE = 1000

const errorMessage = (output: unknown): string | null => {
  if (output && typeof output === 'object' && 'message' in output) {
    return String((output as { message: unknown }).message)
  }
  return null
}

/**
 * Runs a handler inside a fresh context. If the payload carries `tenantId` / `locale`,
 * logger, audit and tenant helpers pick them up automatically.
 */
async function run(registration: JobRegistration, data: unknown, jobId: string): Promise<void> {
  const parsed = registration.job.schema.parse(data) as { tenantId?: string; locale?: string }
  await runWithContext(
    { requestId: jobId, tenantId: parsed.tenantId, locale: parsed.locale ?? 'id' },
    () => registration.handler(parsed),
  )
}

/** pg-boss: queue, retries and cron in Postgres. No Redis. */
export function createPgBossQueue(connectionString: string) {
  const boss = new PgBoss({ connectionString })
  boss.on('error', (error) => logger.error({ err: error }, 'pg-boss error'))
  let started: Promise<unknown> | undefined
  const ensureStarted = () => {
    started ??= boss.start()
    return started
  }
  const createdQueues = new Set<string>()
  const ensureQueue = async (name: string) => {
    if (createdQueues.has(name)) return
    await boss.createQueue(name)
    createdQueues.add(name)
  }

  return {
    async enqueue(job, data) {
      await ensureStarted()
      await ensureQueue(job.name)
      const parsed = job.schema.parse(data)
      await boss.send(job.name, parsed as object, { retryLimit: job.retryLimit ?? 5 })
    },
    async work(registrations: JobRegistration[]) {
      await ensureStarted()
      for (const registration of registrations) {
        const { job } = registration
        await ensureQueue(job.name)
        if (job.cron) await boss.schedule(job.name, job.cron, {})
        await boss.work(job.name, async (batch) => {
          for (const item of batch) await run(registration, item.data, item.id)
        })
        logger.info({ job: job.name, cron: job.cron }, 'worker registered')
      }
    },
    async stop() {
      if (started) await boss.stop({ graceful: true })
    },
    // JobAdmin: pg-boss's public API only (getQueues, findJobs, retry), no direct table access.
    async listFailed() {
      await ensureStarted()
      const failed: FailedJob[] = []
      for (const queue of await boss.getQueues()) {
        const jobs = await boss.findJobs(queue.name, { limit: SCAN_LIMIT_PER_QUEUE })
        for (const job of jobs) {
          if (job.state !== 'failed') continue
          failed.push({
            id: job.id,
            queue: job.name,
            payload: job.data,
            error: errorMessage(job.output),
            failedAt: job.completedOn,
            retryCount: job.retryCount,
          })
        }
      }
      return failed.sort((a, b) => (b.failedAt?.getTime() ?? 0) - (a.failedAt?.getTime() ?? 0))
    },
    async retry(queue, jobId) {
      await ensureStarted()
      const [job] = await boss.findJobs(queue, { id: jobId })
      if (!job) return 'not_found'
      if (job.state !== 'failed') return 'not_failed'
      await boss.retry(queue, jobId)
      return 'retried'
    },
  } satisfies JobQueue & JobAdmin & Record<string, unknown>
}

/**
 * For tests: runs jobs immediately in-process (payloads still validated).
 * Jobs without a registered handler are recorded but not run.
 */
export function inlineQueue(registrations: JobRegistration[] = []) {
  const byName = new Map(registrations.map((r) => [r.job.name, r]))
  const ran: { name: string; data: unknown }[] = []
  const failed = new Map<string, FailedJob>()
  return {
    ran,
    /** Test helper: pretend a job exhausted its retries. Returns its id. */
    seedFailed(input: { queue: string; payload: unknown; error?: string; failedAt?: Date }) {
      const id = randomUUID()
      failed.set(id, {
        id,
        queue: input.queue,
        payload: input.payload,
        error: input.error ?? 'boom',
        failedAt: input.failedAt ?? new Date(),
        retryCount: 5,
      })
      return id
    },
    register(registration: JobRegistration) {
      byName.set(registration.job.name, registration)
    },
    async enqueue(job, data) {
      const parsed = job.schema.parse(data)
      ran.push({ name: job.name, data: parsed })
      const registration = byName.get(job.name)
      if (registration) await run(registration, parsed, getContext()?.requestId ?? randomUUID())
    },
    async listFailed() {
      return [...failed.values()].sort(
        (a, b) => (b.failedAt?.getTime() ?? 0) - (a.failedAt?.getTime() ?? 0),
      )
    },
    /** Like pg-boss it re-queues; inline, that means running the handler again right away. */
    async retry(queue, jobId) {
      const job = failed.get(jobId)
      if (!job || job.queue !== queue) return 'not_found'
      failed.delete(jobId)
      const registration = byName.get(queue)
      if (registration) {
        try {
          await run(registration, job.payload, jobId)
        } catch (error) {
          failed.set(jobId, {
            ...job,
            error: error instanceof Error ? error.message : String(error),
            failedAt: new Date(),
            retryCount: job.retryCount + 1,
          })
        }
      }
      return 'retried'
    },
  } satisfies JobQueue & JobAdmin & Record<string, unknown>
}
