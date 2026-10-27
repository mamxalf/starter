import { withSystem } from '@starter/db'
import { defineJob, handle } from '@starter/platform/jobs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createTestDeps, type TestKit } from '../test/helpers'
import { summarizePayload } from './jobs/jobs.service'

let kit: TestKit
const REASON = 'Mail provider was down'
const call = <T>(fn: () => Promise<T>) => kit.inRequest(fn)
const admin = () => kit.adminClientAs('boss')

const flaky = defineJob({ name: 'test.flaky', schema: z.object({ n: z.number() }) })
let flakyShouldFail = true

const jobAuditRows = () =>
  withSystem(kit.db, (trx) =>
    trx
      .selectFrom('platform_audit_events')
      .selectAll()
      .where('action', '=', 'job.retried')
      .execute(),
  )

beforeAll(async () => {
  kit = await createTestDeps({ admin: { platformAdmins: ['boss@example.com'] } })
  kit.signUp('boss', 'boss@example.com')
  kit.signUp('alice', 'alice@example.com')
  kit.queue.register(
    handle(flaky, async () => {
      if (flakyShouldFail) throw new Error('still broken')
    }),
  )
})

afterAll(() => kit.db.destroy())

describe('summarizePayload', () => {
  it('keeps short fields, cuts long ones and hides credentials and links', () => {
    const summary = summarizePayload({
      template: 'invitation',
      to: 'a@example.com',
      props: { acceptUrl: 'https://app.example.com/invite/SECRET' },
      acceptUrl: 'https://app.example.com/invite/SECRET',
      apiToken: 'abc',
      note: 'x'.repeat(100),
    })
    expect(summary).toContain('template=invitation')
    expect(summary).toContain('to=a@example.com')
    expect(summary).toContain('props={…}')
    expect(summary).toContain('acceptUrl=[redacted]')
    expect(summary).toContain('apiToken=[redacted]')
    expect(summary).not.toContain('SECRET')
    expect(summary).toContain(`note=${'x'.repeat(60)}…`)
  })
})

describe('jobs.listFailed', () => {
  it('lists failed jobs newest first with a payload digest, and paginates', async () => {
    kit.queue.seedFailed({
      queue: 'email.send',
      payload: { to: 'old@example.com', acceptUrl: 'https://x/invite/SECRET' },
      error: 'SMTP down',
      failedAt: new Date('2026-01-01T00:00:00Z'),
    })
    kit.queue.seedFailed({
      queue: 'test.flaky',
      payload: { n: 1 },
      failedAt: new Date('2026-02-01T00:00:00Z'),
    })

    const page = await call(() => admin().jobs.listFailed({}))
    expect(page.total).toBe(2)
    expect(page.items.map((j) => j.queue)).toEqual(['test.flaky', 'email.send'])
    expect(page.items[1]).toMatchObject({ error: 'SMTP down' })
    expect(page.items[1]?.payloadSummary).toBe('to=old@example.com acceptUrl=[redacted]')

    const second = await call(() => admin().jobs.listFailed({ page: 2, pageSize: 1 }))
    expect(second.items.map((j) => j.queue)).toEqual(['email.send'])
  })
})

describe('jobs.retry', () => {
  const failedIds = async () =>
    (await call(() => admin().jobs.listFailed({ pageSize: 100 }))).items.map((j) => j.id)

  it('re-runs the job and writes one audit row with the reason', async () => {
    flakyShouldFail = false
    const id = kit.queue.seedFailed({ queue: 'test.flaky', payload: { n: 7 } })

    await call(() => admin().jobs.retry({ queue: 'test.flaky', jobId: id, reason: REASON }))

    expect(await failedIds()).not.toContain(id)
    const rows = await jobAuditRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      action: 'job.retried',
      target_type: 'job',
      target_id: id,
      reason: REASON,
      metadata: { queue: 'test.flaky' },
    })
  })

  it('keeps a job that fails again on the failed list', async () => {
    flakyShouldFail = true
    const id = kit.queue.seedFailed({ queue: 'test.flaky', payload: { n: 8 } })
    await call(() => admin().jobs.retry({ queue: 'test.flaky', jobId: id, reason: REASON }))
    expect(await failedIds()).toContain(id)
    expect(await jobAuditRows()).toHaveLength(2) // the attempt was still an admin action
  })

  it('rolls the audit row back when the job does not exist', async () => {
    const before = (await jobAuditRows()).length
    await expect(
      call(() => admin().jobs.retry({ queue: 'test.flaky', jobId: 'nope', reason: REASON })),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(await jobAuditRows()).toHaveLength(before)
  })

  it('requires a reason of at least five characters', async () => {
    const before = (await jobAuditRows()).length
    await expect(
      call(() => admin().jobs.retry({ queue: 'test.flaky', jobId: 'x', reason: 'no' })),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(await jobAuditRows()).toHaveLength(before)
  })
})
