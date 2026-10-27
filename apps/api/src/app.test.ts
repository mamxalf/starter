import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from './app'
import { createTestDeps, type TestKit } from './test/helpers'

let kit: TestKit
let app: Awaited<ReturnType<typeof buildApp>>

beforeAll(async () => {
  kit = await createTestDeps()
  app = await buildApp(kit.deps)
})

afterAll(async () => {
  await app.close()
  await kit.db.destroy()
})

describe('http', () => {
  it('serves health and readiness', async () => {
    expect((await app.inject({ url: '/healthz' })).json()).toEqual({ ok: true })
    expect((await app.inject({ url: '/readyz' })).statusCode).toBe(200)
  })

  it('routes oRPC calls through the full HTTP stack', async () => {
    kit.signUp('alice', 'alice@example.com')
    const res = await app.inject({
      method: 'POST',
      url: '/api/rpc/me/get',
      headers: { authorization: kit.auth.tokenFor('alice'), 'content-type': 'application/json' },
      payload: {},
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ json: { user: { email: 'alice@example.com' } } })
  })

  it('answers 401 without credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/rpc/me/get',
      headers: { 'content-type': 'application/json' },
      payload: {},
    })
    expect(res.statusCode).toBe(401)
  })
})
