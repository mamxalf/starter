import { randomUUID } from 'node:crypto'
import { createPgBossQueue, defineJob, handle } from '@starter/platform/jobs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

/**
 * The real pg-boss adapter against the test database: a job that fails for good shows up in
 * listFailed(), and retry() puts it back so the worker finishes it. Polling makes this a few seconds.
 */
const job = defineJob({
  name: 'admin.pgboss-test',
  schema: z.object({ run: z.string() }),
  retryLimit: 0,
})

const run = randomUUID()
let failing = true
let jobId = ''
const queue = createPgBossQueue(process.env.TEST_DATABASE_URL as string)

const mine = async () =>
  (await queue.listFailed()).filter((j) => (j.payload as { run?: string }).run === run)

const until = async <T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  timeoutMs = 20_000,
) => {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await read()
    if (done(value) || Date.now() > deadline) return value
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}

beforeAll(async () => {
  await queue.work([
    handle(job, async () => {
      if (failing) throw new Error('exploded on purpose')
    }),
  ])
  await queue.enqueue(job, { run })
}, 30_000)

afterAll(() => queue.stop())

describe('pg-boss JobAdmin', () => {
  it('lists a job that exhausted its retries, then retries it', async () => {
    const failed = await until(mine, (jobs) => jobs.length > 0)
    expect(failed).toHaveLength(1)
    expect(failed[0]).toMatchObject({
      queue: 'admin.pgboss-test',
      error: 'exploded on purpose',
    })
    expect(failed[0]?.failedAt).toBeInstanceOf(Date)

    jobId = failed[0]?.id as string
    failing = false
    expect(await queue.retry('admin.pgboss-test', jobId)).toBe('retried')
    const after = await until(mine, (jobs) => jobs.length === 0)
    expect(after).toHaveLength(0)
  }, 60_000)

  it('refuses unknown jobs and jobs that are not failed', async () => {
    expect(await queue.retry('admin.pgboss-test', randomUUID())).toBe('not_found')
    // The job retried above has completed, so it is no longer a failed job.
    expect(await queue.retry('admin.pgboss-test', jobId)).toBe('not_failed')
  })
})
