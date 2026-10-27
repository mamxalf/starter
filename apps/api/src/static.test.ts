import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from './app'
import { createTestDeps, type TestKit } from './test/helpers'

const ADMIN = 'admin.example.com'
const WEB = 'app.example.com'

let kit: TestKit
let tmp: string
let webDist: string
let adminDist: string

const write = (dir: string, file: string, content: string) => {
  mkdirSync(join(dir, file, '..'), { recursive: true })
  writeFileSync(join(dir, file), content)
}

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'spa-'))
  webDist = join(tmp, 'web')
  adminDist = join(tmp, 'admin')
  write(webDist, 'index.html', 'WEB-INDEX')
  write(webDist, 'assets/web.js', 'WEB-ASSET')
  write(adminDist, 'index.html', 'ADMIN-INDEX')
  write(adminDist, 'assets/admin.js', 'ADMIN-ASSET')
  kit = await createTestDeps({ admin: { adminHost: ADMIN } })
})

afterAll(async () => {
  await kit.db.destroy()
  rmSync(tmp, { recursive: true, force: true })
})

const get = async (opts: {
  host: string
  url: string
  adminDist?: string
  method?: 'GET' | 'POST'
}) => {
  const app = await buildApp(kit.deps, { webDist, adminDist: opts.adminDist ?? adminDist })
  const res = await app.inject({
    method: opts.method ?? 'GET',
    url: opts.url,
    headers: { host: opts.host },
  })
  await app.close()
  return res
}

describe('SPA serving by host', () => {
  it('serves the web app on the app host, with SPA fallback', async () => {
    expect((await get({ host: WEB, url: '/' })).body).toBe('WEB-INDEX')
    expect((await get({ host: WEB, url: '/some/spa/route?x=1' })).body).toBe('WEB-INDEX')
    expect((await get({ host: WEB, url: '/assets/web.js' })).body).toBe('WEB-ASSET')
  })

  it('serves the admin app on ADMIN_HOST, with SPA fallback', async () => {
    expect((await get({ host: ADMIN, url: '/' })).body).toBe('ADMIN-INDEX')
    expect((await get({ host: ADMIN, url: '/tenants/abc?tab=members' })).body).toBe('ADMIN-INDEX')
    expect((await get({ host: ADMIN, url: '/assets/admin.js' })).body).toBe('ADMIN-ASSET')
    expect((await get({ host: ADMIN.toUpperCase(), url: '/' })).body).toBe('ADMIN-INDEX')
  })

  it('never serves one app files on the other host', async () => {
    expect((await get({ host: ADMIN, url: '/assets/web.js' })).body).toBe('ADMIN-INDEX')
    expect((await get({ host: WEB, url: '/assets/admin.js' })).body).toBe('WEB-INDEX')
  })

  it('does not escape the app directory', async () => {
    for (const url of [
      '/..%2f..%2f..%2fetc%2fpasswd',
      '/%2e%2e/%2e%2e/etc/passwd',
      '/assets/%00',
    ]) {
      const res = await get({ host: WEB, url })
      expect(res.body).not.toContain('root:')
      expect([200, 400, 404]).toContain(res.statusCode)
      if (res.statusCode === 200) expect(res.body).toBe('WEB-INDEX')
    }
  })

  it('answers 404 JSON for /api/* and for non-GET methods, on both hosts', async () => {
    for (const host of [WEB, ADMIN]) {
      const api = await get({ host, url: '/api/nothing-here' })
      expect(api.statusCode).toBe(404)
      expect(api.json()).toEqual({ message: 'Not found' })
      expect((await get({ host, url: '/anything', method: 'POST' })).statusCode).toBe(404)
    }
  })

  it('answers 404 on the admin host when no admin build is deployed', async () => {
    const res = await get({ host: ADMIN, url: '/', adminDist: join(tmp, 'missing') })
    expect(res.statusCode).toBe(404)
    expect((await get({ host: WEB, url: '/', adminDist: join(tmp, 'missing') })).body).toBe(
      'WEB-INDEX',
    )
  })

  it('keeps the health endpoints on every host', async () => {
    expect((await get({ host: ADMIN, url: '/healthz' })).statusCode).toBe(200)
    expect((await get({ host: WEB, url: '/readyz' })).statusCode).toBe(200)
  })

  it('serves the web app everywhere when no admin host is configured', async () => {
    kit.deps.admin.adminHost = undefined
    expect((await get({ host: ADMIN, url: '/' })).body).toBe('WEB-INDEX')
    kit.deps.admin.adminHost = ADMIN
  })
})
