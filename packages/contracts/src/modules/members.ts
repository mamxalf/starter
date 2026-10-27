import { oc } from '@orpc/contract'
import { z } from 'zod'
import { Role } from '../shared'

export const Member = z.object({
  userId: z.uuid(),
  email: z.email(),
  name: z.string().nullable(),
  role: Role,
  joinedAt: z.date(),
})

const Ok = z.object({ ok: z.literal(true) })

export const membersContract = {
  list: oc.output(z.array(Member)),
  /** Owners and admins only; `owner` is never assignable here, use transferOwnership. */
  changeRole: oc
    .input(z.object({ userId: z.uuid(), role: z.enum(['admin', 'member']) }))
    .output(Member),
  remove: oc.input(z.object({ userId: z.uuid() })).output(Ok),
  /** The caller leaves the tenant. Owners must transfer ownership first. */
  leave: oc.output(Ok),
  /** Owner only. The previous owner becomes an admin. */
  transferOwnership: oc.input(z.object({ userId: z.uuid() })).output(Ok),
}
