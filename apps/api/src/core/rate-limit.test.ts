import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../app'
import { createTestDeps, type TestKit } from '../test/helpers'
import { createLimiter } from './rate-limit'

describe('createLimiter', () => {
  it('allows up to max per window, then resets', () => {
    vi.useFakeTimers()
    const check = createLimiter({ max: 2, windowMs: 1000 })
    check('a')
    check('a')
    expect(() => check('a')).toThrow(/Too many requests/)
    check('b')
    vi.advanceTimersByTime(1001)
    expect(() => check('a')).not.toThrow()
    vi.useRealTimers()
  })
})

describe('rate limiting', () => {
  let kit: TestKit

  beforeAll(async () => {
    kit = await createTestDeps()
    kit.signUp('alice', 'alice@example.com')
  })
  afterAll(() => kit.db.destroy())

  it('does not let a rotating x-tenant-slug header reset the IP counter', async () => {
    const app = await buildApp(kit.deps, { rateLimitMax: 3 })
    const statuses: number[] = []
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({
        method: 'GET',
        url: '/healthz',
        headers: { 'x-tenant-slug': `t${i}` },
      })
      statuses.push(res.statusCode)
    }
    expect(statuses).toEqual([200, 200, 200, 429, 429])
    await app.close()
  })

  it('limits acceptInvitation per user', async () => {
    const client = kit.clientAs('alice')
    for (let i = 0; i < 10; i++) {
      await expect(
        kit.inRequest(() =>
          client.tenants.acceptInvitation({ token: `missing-${i}`.padEnd(43, 'x') }),
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    }
    await expect(
      kit.inRequest(() => client.tenants.acceptInvitation({ token: 'missing-11'.padEnd(43, 'x') })),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })
  })
})
