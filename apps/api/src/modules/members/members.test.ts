import { newId, sql, withSystem } from '@starter/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDeps, type TestKit } from '../../test/helpers'

let kit: TestKit
const ids: Record<string, string> = {}

const idOf = (name: string) => ids[name] as string
const as = (name: string, tenant = 'acme') => kit.clientAs(name, tenant)
const call = <T>(fn: () => Promise<T>) => kit.inRequest(fn)

/** Test setup shortcut: puts a signed-up user straight into a tenant, bypassing invitations. */
async function addMember(tenantSlug: string, name: string, role: 'admin' | 'member') {
  await withSystem(kit.db, async (trx) => {
    const tenant = await trx
      .selectFrom('tenants')
      .select('id')
      .where('slug', '=', tenantSlug)
      .executeTakeFirstOrThrow()
    await trx
      .insertInto('memberships')
      .values({ id: newId(), tenant_id: tenant.id, user_id: idOf(name), role })
      .execute()
  })
}

async function roleOf(name: string, tenantSlug = 'acme') {
  const result = await withSystem(kit.db, (trx) =>
    trx
      .selectFrom('memberships')
      .innerJoin('tenants', 'tenants.id', 'memberships.tenant_id')
      .select('memberships.role')
      .where('tenants.slug', '=', tenantSlug)
      .where('memberships.user_id', '=', idOf(name))
      .executeTakeFirst(),
  )
  return result?.role
}

const ownerCount = async (tenantSlug: string) => {
  const result = await withSystem(kit.db, (trx) =>
    sql<{ n: string }>`
      select count(*) as n from memberships m join tenants t on t.id = m.tenant_id
      where t.slug = ${tenantSlug} and m.role = 'owner'`.execute(trx),
  )
  return Number(result.rows[0]?.n)
}

beforeAll(async () => {
  kit = await createTestDeps()
  for (const name of ['owner', 'admin1', 'admin2', 'member1', 'member2', 'outsider', 'newbie']) {
    kit.signUp(name, `${name}@example.com`)
    ids[name] = (await call(() => kit.clientAs(name).me.get())).user.id
  }
  await call(() =>
    as('owner', '').tenants.create({ name: 'Acme', slug: 'acme', defaultLocale: 'en' }),
  )
  await call(() =>
    as('outsider', '').tenants.create({ name: 'Beta', slug: 'beta', defaultLocale: 'en' }),
  )
  await addMember('acme', 'admin1', 'admin')
  await addMember('acme', 'admin2', 'admin')
  await addMember('acme', 'member1', 'member')
  await addMember('acme', 'member2', 'member')
})

afterAll(() => kit.db.destroy())

describe('members.list', () => {
  it('lists every member with email and role', async () => {
    const members = await call(() => as('member1').members.list())
    expect(members.map((x) => [x.email, x.role]).sort()).toEqual([
      ['admin1@example.com', 'admin'],
      ['admin2@example.com', 'admin'],
      ['member1@example.com', 'member'],
      ['member2@example.com', 'member'],
      ['owner@example.com', 'owner'],
    ])
  })
})

describe('members.changeRole', () => {
  it('lets only the owner grant admin', async () => {
    await expect(
      call(() => as('admin1').members.changeRole({ userId: idOf('member2'), role: 'admin' })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(await roleOf('member2')).toBe('member')

    const promoted = await call(() =>
      as('owner').members.changeRole({ userId: idOf('member2'), role: 'admin' }),
    )
    expect(promoted.role).toBe('admin')
    await call(() => as('owner').members.changeRole({ userId: idOf('member2'), role: 'member' }))
    expect(await roleOf('member2')).toBe('member')
  })

  it('lets an admin manage plain members without escalating them', async () => {
    const same = await call(() =>
      as('admin1').members.changeRole({ userId: idOf('member2'), role: 'member' }),
    )
    expect(same.role).toBe('member')
  })

  it('stops an admin from changing the owner or another admin', async () => {
    for (const target of ['owner', 'admin2']) {
      await expect(
        call(() => as('admin1').members.changeRole({ userId: idOf(target), role: 'member' })),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    }
    expect(await roleOf('owner')).toBe('owner')
    expect(await roleOf('admin2')).toBe('admin')
  })

  it('lets the owner demote an admin, but never the owner', async () => {
    await call(() => as('owner').members.changeRole({ userId: idOf('admin2'), role: 'member' }))
    expect(await roleOf('admin2')).toBe('member')
    await call(() => as('owner').members.changeRole({ userId: idOf('admin2'), role: 'admin' }))

    await expect(
      call(() => as('owner').members.changeRole({ userId: idOf('owner'), role: 'admin' })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(await ownerCount('acme')).toBe(1)
  })

  it('refuses plain members', async () => {
    await expect(
      call(() => as('member1').members.changeRole({ userId: idOf('member2'), role: 'admin' })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('writes an audit event', async () => {
    await call(() => as('owner').members.changeRole({ userId: idOf('member2'), role: 'admin' }))
    await call(() => as('owner').members.changeRole({ userId: idOf('member2'), role: 'member' }))
    const rows = await withSystem(kit.db, (trx) =>
      trx
        .selectFrom('audit_events')
        .select(['action', 'target_id'])
        .where('action', '=', 'member.role_changed')
        .execute(),
    )
    expect(rows).toContainEqual({ action: 'member.role_changed', target_id: idOf('member2') })
  })
})

describe('members.remove', () => {
  it('lets an admin remove a member but not the owner or another admin', async () => {
    await addMember('acme', 'newbie', 'member')
    await call(() => as('admin1').members.remove({ userId: idOf('newbie') }))
    expect(await roleOf('newbie')).toBeUndefined()

    for (const target of ['owner', 'admin2']) {
      await expect(
        call(() => as('admin1').members.remove({ userId: idOf(target) })),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    }
  })

  it('refuses plain members, and refuses anyone removing themselves', async () => {
    await expect(
      call(() => as('member1').members.remove({ userId: idOf('member2') })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      call(() => as('member1').members.remove({ userId: idOf('member1') })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      call(() => as('owner').members.remove({ userId: idOf('owner') })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('lets the owner remove an admin', async () => {
    await addMember('acme', 'newbie', 'admin')
    await call(() => as('owner').members.remove({ userId: idOf('newbie') }))
    expect(await roleOf('newbie')).toBeUndefined()
  })
})

describe('members.leave', () => {
  it('lets a member leave and drops their access', async () => {
    await addMember('acme', 'newbie', 'member')
    await call(() => as('newbie').members.leave())
    expect(await roleOf('newbie')).toBeUndefined()
    await expect(call(() => as('newbie').tenants.current())).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('does not let the owner leave without transferring', async () => {
    await expect(call(() => as('owner').members.leave())).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(await ownerCount('acme')).toBe(1)
  })
})

describe('members.transferOwnership', () => {
  it('is owner only', async () => {
    for (const actor of ['admin1', 'member1']) {
      await expect(
        call(() => as(actor).members.transferOwnership({ userId: idOf('member1') })),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    }
  })

  it('rejects transferring to yourself or to a non-member', async () => {
    await expect(
      call(() => as('owner').members.transferOwnership({ userId: idOf('owner') })),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(
      call(() => as('owner').members.transferOwnership({ userId: idOf('outsider') })),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('moves ownership atomically and demotes the old owner to admin', async () => {
    await call(() => as('owner').members.transferOwnership({ userId: idOf('member1') }))
    expect(await roleOf('member1')).toBe('owner')
    expect(await roleOf('owner')).toBe('admin')
    expect(await ownerCount('acme')).toBe(1)

    // The old owner lost the privilege immediately; the new one has it.
    await expect(
      call(() => as('owner').members.transferOwnership({ userId: idOf('admin1') })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await call(() => as('member1').members.transferOwnership({ userId: idOf('owner') }))
    expect(await roleOf('owner')).toBe('owner')
    expect(await ownerCount('acme')).toBe(1)
  })

  it('cannot end up with two owners, even through a direct write', async () => {
    await addMember('acme', 'newbie', 'admin')
    await expect(
      withSystem(kit.db, (trx) =>
        trx
          .updateTable('memberships')
          .set({ role: 'owner' })
          .where('user_id', '=', idOf('newbie'))
          .execute(),
      ),
    ).rejects.toThrow()
    await withSystem(kit.db, (trx) =>
      trx.deleteFrom('memberships').where('user_id', '=', idOf('newbie')).execute(),
    )
  })
})

describe('invitations: revoke and resend', () => {
  const tokenFrom = () => kit.mailer.outbox.at(-1)?.html.match(/\/invite\/([\w-]+)/)?.[1] as string

  it('resend issues a new link and kills the old one', async () => {
    const invitation = await call(() =>
      as('owner').tenants.invite({ email: 'newbie@example.com', role: 'member' }),
    )
    const oldToken = tokenFrom()

    const resent = await call(() => as('admin1').tenants.resendInvitation({ id: invitation.id }))
    expect(resent.id).toBe(invitation.id)
    const newToken = tokenFrom()
    expect(newToken).not.toBe(oldToken)

    await expect(
      call(() => kit.clientAs('newbie').tenants.acceptInvitation({ token: oldToken })),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    await call(() => as('owner').tenants.revokeInvitation({ id: invitation.id }))
    await expect(
      call(() => kit.clientAs('newbie').tenants.acceptInvitation({ token: newToken })),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      call(() => as('owner').tenants.revokeInvitation({ id: invitation.id })),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('lets only the owner invite admins', async () => {
    await expect(
      call(() => as('admin1').tenants.invite({ email: 'newbie@example.com', role: 'admin' })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    const adminInvite = await call(() =>
      as('owner').tenants.invite({ email: 'newbie@example.com', role: 'admin' }),
    )
    const memberInvite = await call(() =>
      as('admin1').tenants.invite({ email: 'other@example.com', role: 'member' }),
    )

    // An admin cannot touch the admin invitation, but handles member invitations.
    await expect(
      call(() => as('admin1').tenants.resendInvitation({ id: adminInvite.id })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      call(() => as('admin1').tenants.revokeInvitation({ id: adminInvite.id })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await call(() => as('admin1').tenants.resendInvitation({ id: memberInvite.id }))
    await call(() => as('admin1').tenants.revokeInvitation({ id: memberInvite.id }))
    await call(() => as('owner').tenants.revokeInvitation({ id: adminInvite.id }))
  })

  it('is admin only', async () => {
    const invitation = await call(() =>
      as('owner').tenants.invite({ email: 'newbie@example.com', role: 'member' }),
    )
    await expect(
      call(() => as('member2').tenants.revokeInvitation({ id: invitation.id })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      call(() => as('member2').tenants.resendInvitation({ id: invitation.id })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await call(() => as('owner').tenants.revokeInvitation({ id: invitation.id }))
  })
})

describe('seat limit on accept', () => {
  it('re-checks max_members when the invitation is accepted', async () => {
    // Free plan: 3 seats. Owner (1) + two pending invitations fills it exactly.
    await call(() =>
      as('outsider', 'beta').tenants.invite({ email: 'newbie@example.com', role: 'member' }),
    )
    const token = kit.mailer.outbox.at(-1)?.html.match(/\/invite\/([\w-]+)/)?.[1] as string
    await withSystem(kit.db, async (trx) => {
      const free = await trx
        .selectFrom('plans')
        .select('id')
        .where('code', '=', 'free')
        .executeTakeFirstOrThrow()
      await trx
        .updateTable('subscriptions')
        .set({ plan_id: free.id })
        .where('tenant_id', 'in', trx.selectFrom('tenants').select('id').where('slug', '=', 'beta'))
        .execute()
    })

    // Seats fill up behind the pending invitation's back.
    await addMember('beta', 'admin1', 'member')
    await addMember('beta', 'admin2', 'member')

    await expect(
      call(() => kit.clientAs('newbie').tenants.acceptInvitation({ token })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'Member limit reached for your plan' })
    expect(await roleOf('newbie', 'beta')).toBeUndefined()
  })

  it('still accepts when the invitation itself is the last seat', async () => {
    await withSystem(kit.db, (trx) =>
      trx
        .deleteFrom('memberships')
        .where('user_id', '=', idOf('admin2'))
        .where('tenant_id', 'in', trx.selectFrom('tenants').select('id').where('slug', '=', 'beta'))
        .execute(),
    )
    const token = await withSystem(kit.db, (trx) =>
      trx.selectFrom('invitations').select('token').executeTakeFirstOrThrow(),
    )
    await call(() => kit.clientAs('newbie').tenants.acceptInvitation({ token: token.token }))
    expect(await roleOf('newbie', 'beta')).toBe('member')
  })
})

describe('tenant isolation', () => {
  it('keeps another tenant out of the member list and invitations', async () => {
    await expect(call(() => as('outsider', 'acme').members.list())).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(
      call(() => as('outsider', 'acme').members.remove({ userId: idOf('member1') })),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('cannot reach members or invitations of another tenant by id', async () => {
    // acme's member id, used from inside beta where it does not exist.
    const before = await roleOf('member1')
    await expect(
      call(() => as('outsider', 'beta').members.remove({ userId: idOf('member1') })),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      call(() =>
        as('outsider', 'beta').members.changeRole({ userId: idOf('member1'), role: 'admin' }),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(await roleOf('member1')).toBe(before)

    const invitation = await call(() =>
      as('owner').tenants.invite({ email: 'newbie@example.com', role: 'member' }),
    )
    await expect(
      call(() => as('outsider', 'beta').tenants.revokeInvitation({ id: invitation.id })),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      call(() => as('outsider', 'beta').tenants.resendInvitation({ id: invitation.id })),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
