import type { InferContractRouterInputs, InferContractRouterOutputs } from '@orpc/contract'
import { oc } from '@orpc/contract'
import { z } from 'zod'

/**
 * Platform admin API (back-office). Exported ONLY through `@starter/contracts/admin` and used only by
 * apps/admin: it is deliberately not re-exported from `@starter/contracts`.
 */
export const adminContract = {
  /** Who am I? The SPA uses it to tell an allowlisted admin from everyone else (NOT_FOUND). */
  me: oc.output(z.object({ email: z.email(), name: z.string().nullable() })),
}

export type AdminContract = typeof adminContract
export type AdminInputs = InferContractRouterInputs<AdminContract>
export type AdminOutputs = InferContractRouterOutputs<AdminContract>

export * from './shared'
