import { oc } from '@orpc/contract'
import { z } from 'zod'
import { Locale, Role, Slug } from '../shared'

export const Tenant = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  defaultLocale: Locale,
})

export const Invitation = z.object({
  id: z.uuid(),
  email: z.email(),
  role: z.enum(['admin', 'member']),
  expiresAt: z.date(),
})

export const tenantsContract = {
  /** Creates a tenant with the caller as owner and a trial subscription. */
  create: oc
    .input(z.object({ name: z.string().min(2).max(80), slug: Slug, defaultLocale: Locale }))
    .output(Tenant),
  /** Current tenant (from the x-tenant-slug header) and the caller's role in it. */
  current: oc.output(z.object({ tenant: Tenant, role: Role, subscriptionStatus: z.string() })),
  invite: oc
    .input(z.object({ email: z.email(), role: z.enum(['admin', 'member']) }))
    .output(Invitation),
  listInvitations: oc.output(z.array(Invitation)),
  revokeInvitation: oc.input(z.object({ id: z.uuid() })).output(z.object({ ok: z.literal(true) })),
  /** Issues a fresh token and expiry (the old link stops working) and emails it again. */
  resendInvitation: oc.input(z.object({ id: z.uuid() })).output(Invitation),
  acceptInvitation: oc.input(z.object({ token: z.string().min(20) })).output(Tenant),
}
