import { withSystem } from '@starter/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDeps, type TestKit } from '../test/helpers'
import { GRACE_DAYS, markInvoicePaid, runBillingCycle, TRIAL_DAYS } from './billing'

let kit: TestKit
const DAY = 24 * 60 * 60 * 1000

const subscription = () =>
  withSystem(kit.db, (trx) =>
    trx
      .selectFrom('subscriptions')
      .select(['status', 'current_period_end'])
      .executeTakeFirstOrThrow(),
  )
const openInvoices = () =>
  withSystem(kit.db, (trx) =>
    trx.selectFrom('invoices').select(['id', 'amount']).where('status', '=', 'open').execute(),
  )

beforeAll(async () => {
  kit = await createTestDeps()
  kit.signUp('alice', 'alice@example.com')
  await kit.inRequest(() =>
    kit.clientAs('alice').tenants.create({ name: 'Acme', slug: 'acme', defaultLocale: 'id' }),
  )
})

afterAll(() => kit.db.destroy())

describe('billing lifecycle', () => {
  const start = Date.now()

  it('does nothing while the trial is far from ending', async () => {
    expect(await runBillingCycle(kit.db, new Date(start))).toEqual({
      invoiced: 0,
      pastDue: 0,
      suspended: 0,
    })
  })

  it('invoices once, 7 days before the period ends (idempotent)', async () => {
    const near = new Date(start + (TRIAL_DAYS - 6) * DAY)
    expect((await runBillingCycle(kit.db, near)).invoiced).toBe(1)
    expect((await runBillingCycle(kit.db, near)).invoiced).toBe(0)
    expect(await openInvoices()).toEqual([{ id: expect.any(String), amount: 149_000 }])
  })

  it('goes past_due after the due date, then suspended after the grace period', async () => {
    await runBillingCycle(kit.db, new Date(start + (TRIAL_DAYS + 1) * DAY))
    expect((await subscription()).status).toBe('past_due')

    await runBillingCycle(kit.db, new Date(start + (TRIAL_DAYS + GRACE_DAYS + 1) * DAY))
    expect((await subscription()).status).toBe('suspended')

    await expect(
      kit.inRequest(() =>
        kit.clientAs('alice', 'acme').projects.create({ name: 'x', description: null }),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('payment reactivates and extends the period (webhook retries are harmless)', async () => {
    const [invoice] = await openInvoices()
    await markInvoicePaid(kit.db, invoice!.id)
    await markInvoicePaid(kit.db, invoice!.id) // duplicate webhook
    const sub = await subscription()
    expect(sub.status).toBe('active')
    expect(sub.current_period_end.getTime()).toBeGreaterThan(Date.now() + 27 * DAY)
    expect(await openInvoices()).toEqual([])
  })
})
