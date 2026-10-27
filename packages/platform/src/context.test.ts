import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { getContext, runWithContext, updateContext } from './context'
import { defineJob, handle, inlineQueue } from './jobs'
import { memoryMailer } from './mail'

describe('request context', () => {
  it('is isolated per async flow and can be enriched mid-request', async () => {
    const seen: (string | undefined)[] = []
    await Promise.all(
      ['a', 'b'].map((id) =>
        runWithContext({ requestId: id, locale: 'id' }, async () => {
          await new Promise((r) => setTimeout(r, 5))
          updateContext({ tenantId: `tenant-${id}` })
          seen.push(getContext()?.tenantId)
        }),
      ),
    )
    expect(seen.sort()).toEqual(['tenant-a', 'tenant-b'])
    expect(getContext()).toBeUndefined()
  })
})

describe('jobs', () => {
  it('runs the handler inside the tenant context from the payload', async () => {
    let tenantInHandler: string | undefined
    const job = defineJob({ name: 'test.echo', schema: z.object({ tenantId: z.string() }) })
    const queue = inlineQueue([
      handle(job, async () => {
        tenantInHandler = getContext()?.tenantId
      }),
    ])
    await queue.enqueue(job, { tenantId: 't1' })
    expect(tenantInHandler).toBe('t1')
  })

  it('rejects an invalid payload before it is queued', async () => {
    const job = defineJob({ name: 'test.strict', schema: z.object({ tenantId: z.uuid() }) })
    await expect(inlineQueue().enqueue(job, { tenantId: 'nope' })).rejects.toThrow()
  })
})

describe('memory mailer', () => {
  it('formats the tenant display name with the platform address', async () => {
    const mailer = memoryMailer('App <noreply@mail.example.com>')
    await mailer.send({ to: 'a@b.c', subject: 'Hi', html: '<p>Hi</p>', fromName: 'Acme via App' })
    expect(mailer.outbox[0]?.from).toBe('"Acme via App" <noreply@mail.example.com>')
  })
})
