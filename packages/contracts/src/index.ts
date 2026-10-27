import type { InferContractRouterInputs, InferContractRouterOutputs } from '@orpc/contract'
import { filesContract } from './modules/files'
import { meContract } from './modules/me'
import { membersContract } from './modules/members'
import { projectsContract } from './modules/projects'
import { tenantsContract } from './modules/tenants'
// [gen:contract-imports]

/**
 * The API contract: the single boundary between frontends and the backend.
 * Frontends get types from here; the API implements it; OpenAPI can be generated from it.
 */
export const contract = {
  me: meContract,
  tenants: tenantsContract,
  members: membersContract,
  projects: projectsContract,
  files: filesContract,
  // [gen:contracts]
}

export type Contract = typeof contract
export type Inputs = InferContractRouterInputs<Contract>
export type Outputs = InferContractRouterOutputs<Contract>

export * from './modules/files'
export * from './modules/me'
export * from './modules/members'
export * from './modules/projects'
export * from './modules/tenants'
// [gen:contract-exports]
export * from './shared'
