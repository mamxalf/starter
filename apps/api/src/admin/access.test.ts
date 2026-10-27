import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../app'
import { createTestDeps, type TestKit } from '../test/helpers'

let kit: TestKit
const call = <T>(fn: () => Promise<T>) => kit.inRequest(fn)

beforeAll(async () => {
  kit = await createTestDeps({ admin: { platformAdmins: ['boss@example.com'] } })
  kit.signUp('boss', 'Boss@Example.com') // the allowlist is lowercase; matching ignores case
  kit.signUp('alice', 'alice@example.com')
  kit.signUp('ghost', 'ghost@example.com', false) // unverified, and nobody owns this email yet
})

afterAll(() => kit.db.destroy())

const setAdmins = (emails: string[]) => {
  kit.deps.admin.platformAdmins = emails
}

describe('platformAdmin gate', () => {
  it('lets an allowlisted, verified email in', async () => {
    const me = await call(() => kit.adminClientAs('boss').me())
    expect(me.email).toBe('Boss@Example.com')
  })

  it('answers NOT_FOUND to everyone else', async () => {
    await expect(call(() => kit.adminClientAs('alice').me())).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('answers NOT_FOUND to anonymous callers', async () => {
    const { createRouterClient } = await import('@orpc/server')
    const { adminRouter } = await import('./router')
    const anon = createRouterClient(adminRouter, {
      context: { deps: kit.deps, request: new Request('http://admin.test/') },
    })
    await expect(anon.me()).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('does not trust an unverified email, even when it is allowlisted', async () => {
    setAdmins(['ghost@example.com'])
    await expect(call(() => kit.adminClientAs('ghost').me())).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    setAdmins(['boss@example.com'])
  })

  it('is disabled for everyone when the allowlist is empty', async () => {
    setAdmins([])
    await expect(call(() => kit.adminClientAs('boss').me())).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    setAdmins(['boss@example.com'])
  })

  it('requires Cloudflare Access when it is configured', async () => {
    kit.deps.admin.verifyAccess = async () => false
    await expect(call(() => kit.adminClientAs('boss').me())).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    kit.deps.admin.verifyAccess = async () => true
    await expect(call(() => kit.adminClientAs('boss').me())).resolves.toMatchObject({
      name: 'boss',
    })
    kit.deps.admin.verifyAccess = undefined
  })
})

describe('admin host check (production)', () => {
  const rpc = (app: Awaited<ReturnType<typeof buildApp>>, host: string) =>
    app.inject({
      method: 'POST',
      url: '/api/admin/rpc/me',
      headers: {
        host,
        authorization: kit.auth.tokenFor('boss'),
        'content-type': 'application/json',
      },
      payload: '{}',
    })

  it('answers only on ADMIN_HOST', async () => {
    kit.deps.admin.adminHost = 'admin.example.com'
    const app = await buildApp(kit.deps)
    expect((await rpc(app, 'admin.example.com')).statusCode).toBe(200)
    expect((await rpc(app, 'app.example.com')).statusCode).toBe(404)
    await app.close()
    kit.deps.admin.adminHost = undefined
  })

  it('is not mounted at all while the allowlist is empty', async () => {
    setAdmins([])
    const app = await buildApp(kit.deps)
    expect((await rpc(app, 'admin.example.com')).statusCode).toBe(404)
    await app.close()
    setAdmins(['boss@example.com'])
  })
})
