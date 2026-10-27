import type { ClientAuth } from '@starter/auth/react'
import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router'

export type RouterContext = {
  queryClient: QueryClient
  auth: ClientAuth
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
  notFoundComponent: () => (
    <div className="grid min-h-dvh place-items-center gap-2 p-8 text-center">
      <p className="text-2xl font-semibold">404</p>
      <Link to="/" className="underline">
        Home
      </Link>
    </div>
  ),
})
