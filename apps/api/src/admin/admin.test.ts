import { newId, withSystem, withTenant } from '@starter/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { entitlement, runBillingCycle } from '../core/billing'
import { createTestDeps, type TestKit } from '../test/helpers'

let kit: TestKit
let acmeId: string
let betaId: string
let aliceId: string
let bossId: string

const DAY = 24 * 60 * 60 * 1000
const REASON = 'Support ticket #123'

const call = <T>(fn: () => Promise<T>) => kit.inRequest(fn)
const admin = () => kit.adminClientAs('boss')

const auditRows = () =>
  withSystem(kit.db, (trx) =>
    trx
      .selectFrom('platform_audit_events')
      .selectAll()
      .orderBy('created_at')
      .orderBy('id')
      .execute(),
  )
const auditCount = async () => (await auditRows()).length

const subscription = (tenantId = acmeId) =>
  withSystem(kit.db, (trx) =>
    trx
      .selectFrom('subscriptions')
      .select(['id', 'status', 'current_period_end'])
      .where('tenant_id', '=', tenantId)
      .executeTakeFirstOrThrow(),
  )

const setSubscription = (values: { status?: string; current_period_end?: Date }) =>
  withSystem(kit.db, (trx) =>
    trx.updateTable('subscriptions').set(values).where('tenant_id', '=', acmeId).execute(),
  )

beforeAll(async () => {
  kit = await createTestDeps({ admin: { platformAdmins: ['boss@example.com'] } })
  for (const name of ['boss', 'alice', 'bob', 'carol']) kit.signUp(name, `${name}@example.com`)
  aliceId = (await call(() => kit.clientAs('alice').me.get())).user.id
  bossId = (await call(() => kit.clientAs('boss').me.get())).user.id
  const bobId = (await call(() => kit.clientAs('bob').me.get())).user.id

  acmeId = (
    await call(() =>
      kit.clientAs('alice').tenants.create({ name: 'Acme', slug: 'acme', defaultLocale: 'en' }),
    )
  ).id
  betaId = (
    await call(() =>
      kit
        .clientAs('carol')
        .tenants.create({ name: 'Beta Co', slug: 'beta-co', defaultLocale: 'id' }),
    )
  ).id
  await withSystem(kit.db, (trx) =>
    trx
      .insertInto('memberships')
      .values({ id: newId(), tenant_id: acmeId, user_id: bobId, role: 'member' })
      .execute(),
  )
})

afterAll(() => kit.db.destroy())

describe('access', () => {
  it('answers NOT_FOUND to a non-admin on every procedure', async () => {
    const alice = kit.adminClientAs('alice')
    const attempts: Array<() => Promise<unknown>> = [
      () => alice.tenants.list({}),
      () => alice.tenants.get({ tenantId: acmeId }),
      () => alice.tenants.extendTrial({ tenantId: acmeId, days: 3, reason: REASON }),
      () => alice.tenants.changePlan({ tenantId: acmeId, planCode: 'free', reason: REASON }),
      () => alice.tenants.setSuspended({ tenantId: acmeId, suspended: true, reason: REASON }),
      () => alice.users.search({}),
      () => alice.users.get({ userId: aliceId }),
      () => alice.audit.list({}),
    ]
    const before = await auditCount()
    for (const attempt of attempts) {
      await expect(call(attempt)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    }
    expect(await auditCount()).toBe(before)
    expect((await subscription()).status).toBe('trialing')
  })

  it('does not reveal the API through validation errors either', async () => {
    await expect(
      call(() =>
        kit.adminClientAs('alice').tenants.extendTrial({ tenantId: acmeId, days: 3, reason: 'x' }),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('tenants.list and tenants.get', () => {
  it('lists tenants with plan, status and member count', async () => {
    const result = await call(() => admin().tenants.list({}))
    expect(result.total).toBe(2)
    const acme = result.items.find((t) => t.slug === 'acme')
    expect(acme).toMatchObject({
      name: 'Acme',
      planCode: 'pro',
      status: 'trialing',
      memberCount: 2,
    })
    expect(acme?.currentPeriodEnd).toBeInstanceOf(Date)
  })

  it('searches name or slug literally, filters by status and paginates', async () => {
    const byName = await call(() => admin().tenants.list({ q: 'beta' }))
    expect(byName.items.map((t) => t.slug)).toEqual(['beta-co'])
    const wildcard = await call(() => admin().tenants.list({ q: '%' }))
    expect(wildcard.total).toBe(0)
    const suspended = await call(() => admin().tenants.list({ status: 'suspended' }))
    expect(suspended.total).toBe(0)
    const paged = await call(() => admin().tenants.list({ page: 2, pageSize: 1 }))
    expect(paged.total).toBe(2)
    expect(paged.items).toHaveLength(1)
  })

  it('returns the detail view', async () => {
    const detail = await call(() => admin().tenants.get({ tenantId: acmeId }))
    expect(detail.tenant).toMatchObject({ slug: 'acme', defaultLocale: 'en' })
    expect(detail.subscription).toMatchObject({ planCode: 'pro', status: 'trialing' })
    expect(detail.members.map((m) => [m.email, m.role]).sort()).toEqual([
      ['alice@example.com', 'owner'],
      ['bob@example.com', 'member'],
    ])
    expect(detail.invoices).toEqual([])
    expect(detail.auditEvents[0]).toMatchObject({
      action: 'tenant.created',
      actorEmail: 'alice@example.com',
    })
  })

  it('answers NOT_FOUND for an unknown tenant', async () => {
    await expect(call(() => admin().tenants.get({ tenantId: newId() }))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('tenants.extendTrial', () => {
  it('moves the period end and writes exactly one audit row', async () => {
    const before = await subscription()
    const rowsBefore = await auditCount()

    const result = await call(() =>
      admin().tenants.extendTrial({ tenantId: acmeId, days: 10, reason: REASON }),
    )

    expect(result.status).toBe('trialing')
    expect(result.currentPeriodEnd.getTime()).toBe(before.current_period_end.getTime() + 10 * DAY)
    expect((await subscription()).current_period_end).toEqual(result.currentPeriodEnd)

    const rows = await auditRows()
    expect(rows).toHaveLength(rowsBefore + 1)
    expect(rows.at(-1)).toMatchObject({
      actor_id: bossId,
      action: 'tenant.trial_extended',
      tenant_id: acmeId,
      target_type: 'tenant',
      target_id: acmeId,
      reason: REASON,
      metadata: { days: 10, tenant: 'acme' },
    })
  })

  it('rejects out-of-range days and missing or short reasons without side effects', async () => {
    const rowsBefore = await auditCount()
    const period = (await subscription()).current_period_end
    const attempts = [
      { days: 0, reason: REASON },
      { days: 61, reason: REASON },
      { days: 5, reason: '' },
      { days: 5, reason: 'abcd' },
      { days: 5, reason: '   a   ' },
    ]
    for (const input of attempts) {
      await expect(
        call(() => admin().tenants.extendTrial({ tenantId: acmeId, ...input })),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    }
    expect(await auditCount()).toBe(rowsBefore)
    expect((await subscription()).current_period_end).toEqual(period)
  })

  it('refuses a canceled subscription and writes nothing', async () => {
    await setSubscription({ status: 'canceled' })
    const rowsBefore = await auditCount()
    await expect(
      call(() => admin().tenants.extendTrial({ tenantId: acmeId, days: 5, reason: REASON })),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(await auditCount()).toBe(rowsBefore)
    await setSubscription({ status: 'trialing' })
  })

  it('is not undone by the next billing cycle when an invoice is overdue', async () => {
    const now = new Date()
    await setSubscription({
      status: 'past_due',
      current_period_end: new Date(now.getTime() - 10 * DAY),
    })
    const sub = await subscription()
    await withSystem(kit.db, (trx) =>
      trx
        .insertInto('invoices')
        .values({
          id: newId(),
          tenant_id: acmeId,
          subscription_id: sub.id,
          amount: 149_000,
          status: 'open',
          due_at: new Date(now.getTime() - 10 * DAY),
        })
        .execute(),
    )

    const result = await call(() =>
      admin().tenants.extendTrial({ tenantId: acmeId, days: 20, reason: REASON }),
    )
    expect(result.status).toBe('trialing')
    expect(result.currentPeriodEnd.getTime()).toBeGreaterThan(now.getTime() + 19 * DAY)

    await runBillingCycle(kit.db, new Date())
    expect((await subscription()).status).toBe('trialing')

    await withSystem(kit.db, (trx) => trx.deleteFrom('invoices').execute())
  })
})

describe('tenants.setSuspended', () => {
  it('makes tenant writes fail with FORBIDDEN, and unsuspending restores them', async () => {
    const alice = () => kit.clientAs('alice', 'acme')
    await call(() => alice().projects.create({ name: 'Before', description: null }))

    await call(() =>
      admin().tenants.setSuspended({ tenantId: acmeId, suspended: true, reason: REASON }),
    )
    await expect(
      call(() => alice().projects.create({ name: 'During', description: null })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    // Read-only, not locked out.
    await expect(call(() => alice().projects.list({}))).resolves.toMatchObject({ total: 1 })

    const restored = await call(() =>
      admin().tenants.setSuspended({ tenantId: acmeId, suspended: false, reason: REASON }),
    )
    expect(restored.status).toBe('active')
    await call(() => alice().projects.create({ name: 'After', description: null }))

    const actions = (await auditRows()).map((r) => r.action)
    expect(actions.filter((a) => a === 'tenant.suspended')).toHaveLength(1)
    expect(actions.filter((a) => a === 'tenant.unsuspended')).toHaveLength(1)
  })

  it('refuses no-op transitions without writing audit rows', async () => {
    const rowsBefore = await auditCount()
    await expect(
      call(() =>
        admin().tenants.setSuspended({ tenantId: acmeId, suspended: false, reason: REASON }),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(await auditCount()).toBe(rowsBefore)
  })
})

describe('tenants.changePlan', () => {
  const maxMembers = (tenantId = acmeId) =>
    withSystem(kit.db, (trx) => entitlement<number>(trx, tenantId, 'max_members'))

  it('changes entitlements immediately and audits once', async () => {
    expect(await maxMembers()).toBe(20)
    const rowsBefore = await auditCount()

    const result = await call(() =>
      admin().tenants.changePlan({ tenantId: acmeId, planCode: 'free', reason: REASON }),
    )

    expect(result.planCode).toBe('free')
    expect(await maxMembers()).toBe(3)
    expect(await maxMembers(betaId)).toBe(20) // other tenants are untouched
    const rows = await auditRows()
    expect(rows).toHaveLength(rowsBefore + 1)
    expect(rows.at(-1)).toMatchObject({
      action: 'tenant.plan_changed',
      reason: REASON,
      metadata: { before: { planCode: 'pro' }, after: { planCode: 'free' } },
    })
  })

  it('rejects the current plan, unknown plans and inactive plans', async () => {
    const rowsBefore = await auditCount()
    await expect(
      call(() =>
        admin().tenants.changePlan({ tenantId: acmeId, planCode: 'free', reason: REASON }),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(
      call(() =>
        admin().tenants.changePlan({ tenantId: acmeId, planCode: 'nope', reason: REASON }),
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

    await withSystem(kit.db, (trx) =>
      trx.updateTable('plans').set({ is_active: false }).where('code', '=', 'pro').execute(),
    )
    await expect(
      call(() => admin().tenants.changePlan({ tenantId: acmeId, planCode: 'pro', reason: REASON })),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await withSystem(kit.db, (trx) =>
      trx.updateTable('plans').set({ is_active: true }).where('code', '=', 'pro').execute(),
    )

    expect(await auditCount()).toBe(rowsBefore)
  })
})

describe('users', () => {
  it('searches by email prefix, case-insensitively and literally', async () => {
    const hit = await call(() => admin().users.search({ q: 'ALI' }))
    expect(hit.items.map((u) => u.email)).toEqual(['alice@example.com'])
    expect((await call(() => admin().users.search({ q: '%' }))).total).toBe(0)
    expect((await call(() => admin().users.search({}))).total).toBe(4)
  })

  it('shows memberships across tenants', async () => {
    const detail = await call(() => admin().users.get({ userId: aliceId }))
    expect(detail.user.email).toBe('alice@example.com')
    expect(detail.memberships).toMatchObject([{ tenantSlug: 'acme', role: 'owner' }])
    await expect(call(() => admin().users.get({ userId: newId() }))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('audit.list', () => {
  it('lists the platform audit log newest first with the actor', async () => {
    const result = await call(() => admin().audit.list({ pageSize: 100 }))
    expect(result.total).toBe((await auditRows()).length)
    expect(result.items[0]?.actorEmail).toBe('boss@example.com')
    const times = result.items.map((e) => e.createdAt.getTime())
    expect(times).toEqual([...times].sort((a, b) => b - a))
  })
})

describe('isolation from the tenant side', () => {
  it('hides platform_audit_events from tenant transactions', async () => {
    expect(await auditCount()).toBeGreaterThan(0)
    const seen = await withTenant(kit.db, acmeId, (trx) =>
      trx.selectFrom('platform_audit_events').selectAll().execute(),
    )
    expect(seen).toEqual([])
  })

  it('refuses writes to platform_audit_events from tenant transactions', async () => {
    await expect(
      withTenant(kit.db, acmeId, (trx) =>
        trx
          .insertInto('platform_audit_events')
          .values({ id: newId(), action: 'forged', reason: 'forged entry' })
          .execute(),
      ),
    ).rejects.toThrow()
  })
})
