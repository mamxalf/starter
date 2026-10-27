import { oc } from '@orpc/contract'
import { z } from 'zod'
import { Pagination, paginated, Role } from '../shared'

export const UserSummary = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string().nullable(),
  createdAt: z.date(),
})

export const UserDetail = z.object({
  user: UserSummary.extend({ locale: z.string().nullable() }),
  memberships: z.array(
    z.object({
      tenantId: z.uuid(),
      tenantName: z.string(),
      tenantSlug: z.string(),
      role: Role,
      joinedAt: z.date(),
    }),
  ),
})

export const usersContract = {
  /** Email prefix, case-insensitive. An empty query lists everyone. */
  search: oc
    .input(Pagination.extend({ q: z.string().trim().max(100).default('') }))
    .output(paginated(UserSummary)),
  get: oc.input(z.object({ userId: z.uuid() })).output(UserDetail),
}
