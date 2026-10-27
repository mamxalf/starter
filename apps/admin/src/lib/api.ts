import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { ContractRouterClient } from '@orpc/contract'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'
import type { AdminContract } from '@starter/contracts/admin'

/** Set by the auth bridge in main.tsx. */
let getAuthorization: () => Promise<string | null> = async () => null

export function setAuthorizationGetter(fn: () => Promise<string | null>) {
  getAuthorization = fn
}

const link = new RPCLink({
  url: () => `${window.location.origin}/api/admin/rpc`,
  headers: async () => {
    const authorization = await getAuthorization()
    return authorization ? { authorization } : {}
  },
})

/** Typed from the admin contract: the only API this app talks to. */
export const api: ContractRouterClient<AdminContract> = createORPCClient(link)

/** TanStack Query helpers: orpc.tenants.list.queryOptions({ input }) etc. */
export const orpc = createTanstackQueryUtils(api)
