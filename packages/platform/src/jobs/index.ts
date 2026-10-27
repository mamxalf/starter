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
  } satisfies JobQueue & Record<string, unknown>
}

/**
 * For tests: runs jobs immediately in-process (payloads still validated).
 * Jobs without a registered handler are recorded but not run.
 */
export function inlineQueue(registrations: JobRegistration[] = []) {
  const byName = new Map(registrations.map((r) => [r.job.name, r]))
  const ran: { name: string; data: unknown }[] = []
  return {
    ran,
    register(registration: JobRegistration) {
      byName.set(registration.job.name, registration)
    },
    async enqueue(job, data) {
      const parsed = job.schema.parse(data)
      ran.push({ name: job.name, data: parsed })
      const registration = byName.get(job.name)
      if (registration) await run(registration, parsed, getContext()?.requestId ?? randomUUID())
    },
  } satisfies JobQueue & Record<string, unknown>
}
