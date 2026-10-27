import { sql, withSystem, withTenant } from '@starter/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDeps, type TestKit } from '../../test/helpers'

let kit: TestKit

beforeAll(async () => {
  kit = await createTestDeps()
  kit.signUp('alice', 'alice@example.com')
  kit.signUp('bob', 'bob@example.com')
  await kit.inRequest(() =>
    kit.clientAs('alice').tenants.create({ name: 'Acme', slug: 'acme', defaultLocale: 'id' }),
  )
  await kit.inRequest(() =>
    kit.clientAs('bob').tenants.create({ name: 'Globex', slug: 'globex', defaultLocale: 'en' }),
  )
})

afterAll(() => kit.db.destroy())

describe('projects', () => {
  it('creates, lists, updates and deletes within a tenant', async () => {
    const api = kit.clientAs('alice', 'acme')
    const created = await kit.inRequest(() =>
      api.projects.create({ name: 'Website', description: null }),
    )
    expect(created.name).toBe('Website')

    const list = await kit.inRequest(() => api.projects.list({ page: 1, pageSize: 20 }))
    expect(list.total).toBe(1)

    const updated = await kit.inRequest(() =>
      api.projects.update({ id: created.id, name: 'Website v2', description: 'new' }),
    )
    expect(updated.name).toBe('Website v2')

    await kit.inRequest(() => api.projects.remove({ id: created.id }))
    await expect(kit.inRequest(() => api.projects.get({ id: created.id }))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('records an audit event with the acting user', async () => {
    const api = kit.clientAs('alice', 'acme')
    const project = await kit.inRequest(() =>
      api.projects.create({ name: 'Audited', description: null }),
    )
    // audit_events is tenant-scoped: reading it outside a tenant context needs the system bypass.
    const events = await withSystem(kit.db, (trx) =>
      trx
        .selectFrom('audit_events')
        .select(['action', 'actor_id'])
        .where('target_id', '=', project.id)
        .execute(),
    )
    expect(events).toEqual([{ action: 'project.created', actor_id: expect.any(String) }])
  })
})

describe('tenant isolation (generated for every module)', () => {
  it('a non-member cannot reach another tenant, even with its slug', async () => {
    await expect(
      kit.inRequest(() => kit.clientAs('bob', 'acme').projects.list({ page: 1, pageSize: 20 })),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it("a tenant's list never contains another tenant's rows", async () => {
    await kit.inRequest(() =>
      kit.clientAs('bob', 'globex').projects.create({ name: 'Globex secret', description: null }),
    )
    const acme = await kit.inRequest(() =>
      kit.clientAs('alice', 'acme').projects.list({ page: 1, pageSize: 100 }),
    )
    expect(acme.items.map((p) => p.name)).not.toContain('Globex secret')
  })

  it('RLS hides other tenants even when a query forgets the tenant filter', async () => {
    const acme = await kit.db
      .selectFrom('tenants')
      .select('id')
      .where('slug', '=', 'acme')
      .executeTakeFirstOrThrow()
    const rows = await withTenant(kit.db, acme.id, (trx) =>
      // Deliberately unfiltered: the safety net must still apply.
      trx.selectFrom('projects').select(['tenant_id']).execute(),
    )
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.tenant_id === acme.id)).toBe(true)
  })

  it('RLS returns nothing outside any tenant context', async () => {
    const rows = await kit.db.selectFrom('projects').selectAll().execute()
    expect(rows).toEqual([])
  })
})

describe('roles and subscription state', () => {
  it('suspended tenants are read-only', async () => {
    await withSystem(kit.db, (trx) =>
      sql`update subscriptions set status = 'suspended'
        where tenant_id = (select id from tenants where slug = 'globex')`.execute(trx),
    )

    const api = kit.clientAs('bob', 'globex')
    await expect(
      kit.inRequest(() => api.projects.create({ name: 'Blocked', description: null })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    const list = await kit.inRequest(() => api.projects.list({ page: 1, pageSize: 20 }))
    expect(list.total).toBeGreaterThan(0)
  })
})
