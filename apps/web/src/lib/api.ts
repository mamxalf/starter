import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { ContractRouterClient } from '@orpc/contract'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'
import { type Contract, TENANT_HEADER } from '@starter/contracts'

/**
 * Request-scoped values the API client needs. Set by the auth bridge (main.tsx)
 * and by the $tenant route (the slug in the URL).
 */
const session: {
  getAuthorization: () => Promise<string | null>
  tenantSlug: string | null
} = {
  getAuthorization: async () => null,
  tenantSlug: null,
}

export function setAuthorizationGetter(fn: () => Promise<string | null>) {
  session.getAuthorization = fn
}

export function setCurrentTenant(slug: string | null) {
  session.tenantSlug = slug
}

const link = new RPCLink({
  url: () => `${window.location.origin}/api/rpc`,
  headers: async () => {
    const headers: Record<string, string> = {}
    const authorization = await session.getAuthorization()
    if (authorization) headers.authorization = authorization
    if (session.tenantSlug) headers[TENANT_HEADER] = session.tenantSlug
    return headers
  },
})

/** Fully typed from the contract: rename a field in packages/contracts and this breaks at compile time. */
export const api: ContractRouterClient<Contract> = createORPCClient(link)

/** TanStack Query helpers: orpc.projects.list.queryOptions({ input }) etc. */
export const orpc = createTanstackQueryUtils(api)
