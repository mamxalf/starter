import { oc } from '@orpc/contract'
import { z } from 'zod'
import { Locale, Role } from '../shared'

export const User = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string().nullable(),
  locale: Locale.nullable(),
})

export const MembershipSummary = z.object({
  tenantId: z.uuid(),
  slug: z.string(),
  name: z.string(),
  role: Role,
})

export const meContract = {
  get: oc.output(z.object({ user: User, memberships: z.array(MembershipSummary) })),
  updateLocale: oc.input(z.object({ locale: Locale })).output(z.object({ ok: z.literal(true) })),
}
