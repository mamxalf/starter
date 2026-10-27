import type { InferContractRouterInputs, InferContractRouterOutputs } from '@orpc/contract'
import { oc } from '@orpc/contract'
import { z } from 'zod'
import { auditContract } from './audit'
import { tenantsContract } from './tenants'
import { usersContract } from './users'

/**
 * Platform admin API (back-office). Exported ONLY through `@starter/contracts/admin` and used only by
 * apps/admin: it is deliberately not re-exported from `@starter/contracts`.
 */
export const adminContract = {
  /** Who am I? The SPA uses it to tell an allowlisted admin from everyone else (NOT_FOUND). */
  me: oc.output(z.object({ email: z.email(), name: z.string().nullable() })),
  tenants: tenantsContract,
  users: usersContract,
  audit: auditContract,
}

export type AdminContract = typeof adminContract
export type AdminInputs = InferContractRouterInputs<AdminContract>
export type AdminOutputs = InferContractRouterOutputs<AdminContract>

export * from './audit'
export * from './shared'
export * from './tenants'
export * from './users'
