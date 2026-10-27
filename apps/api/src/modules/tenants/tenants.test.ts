import { sql } from '@starter/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDeps, type TestKit } from '../../test/helpers'

let kit: TestKit

beforeAll(async () => {
  kit = await createTestDeps()
  kit.signUp('owner', 'owner@example.com')
  kit.signUp('invitee', 'invitee@example.com')
  kit.signUp('stranger', 'stranger@example.com')
  kit.signUp('unverified', 'owner@example.com', false)
})

afterAll(() => kit.db.destroy())

describe('me', () => {
  it('creates our user on first sight and reuses it afterwards', async () => {
    const first = await kit.inRequest(() => kit.clientAs('owner').me.get())
    const second = await kit.inRequest(() => kit.clientAs('owner').me.get())
    expect(first.user.id).toBe(second.user.id)
    expect(first.user.email).toBe('owner@example.com')
  })

  it('refuses to link an unverified email to an existing account', async () => {
    await expect(kit.inRequest(() => kit.clientAs('unverified').me.get())).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('rejects anonymous calls', async () => {
    const { createRouterClient } = await import('@orpc/server')
    const { router } = await import('../../router')
    const anon = createRouterClient(router, {
      context: { deps: kit.deps, request: new Request('http://api.test/') },
    })
    await expect(anon.me.get()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

describe('tenants', () => {
  it('creates a tenant with the caller as owner and a trial subscription', async () => {
    const tenant = await kit.inRequest(() =>
      kit.clientAs('owner').tenants.create({ name: 'Acme', slug: 'acme', defaultLocale: 'en' }),
    )
    const current = await kit.inRequest(() => kit.clientAs('owner', 'acme').tenants.current())
    expect(current).toMatchObject({
      tenant: { id: tenant.id },
      role: 'owner',
      subscriptionStatus: 'trialing',
    })

    const me = await kit.inRequest(() => kit.clientAs('owner').me.get())
    expect(me.memberships).toEqual([
      { tenantId: tenant.id, slug: 'acme', name: 'Acme', role: 'owner' },
    ])
  })

  it('rejects a taken slug with CONFLICT', async () => {
    await expect(
      kit.inRequest(() =>
        kit
          .clientAs('stranger')
          .tenants.create({ name: 'Other', slug: 'acme', defaultLocale: 'id' }),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('invites by email in the tenant locale, and only the invitee can accept', async () => {
    const invitation = await kit.inRequest(() =>
      kit
        .clientAs('owner', 'acme')
        .tenants.invite({ email: 'Invitee@Example.com', role: 'member' }),
    )
    expect(invitation.email).toBe('invitee@example.com')

    const mail = kit.mailer.outbox.at(-1)
    expect(mail?.to).toBe('invitee@example.com')
    expect(mail?.subject).toBe('owner invited you to Acme') // tenant default locale: en
    expect(mail?.from).toBe('"Acme via App" <noreply@mail.example.com>')
    const token = mail?.html.match(/\/invite\/([\w-]+)/)?.[1]
    expect(token).toBeDefined()

    await expect(
      kit.inRequest(() => kit.clientAs('stranger').tenants.acceptInvitation({ token: token! })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    const joined = await kit.inRequest(() =>
      kit.clientAs('invitee').tenants.acceptInvitation({ token: token! }),
    )
    expect(joined.slug).toBe('acme')
    const current = await kit.inRequest(() => kit.clientAs('invitee', 'acme').tenants.current())
    expect(current.role).toBe('member')

    const log = await sql<{ status: string }>`select status from email_log`.execute(kit.db)
    expect(log.rows).toEqual([{ status: 'sent' }])
  })

  it('members cannot invite', async () => {
    await expect(
      kit.inRequest(() =>
        kit.clientAs('invitee', 'acme').tenants.invite({ email: 'x@example.com', role: 'member' }),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
