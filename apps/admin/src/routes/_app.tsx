import { ORPCError } from '@orpc/client'
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { NotAuthorized } from '@/components/not-authorized'
import { orpc } from '@/lib/api'

/** Pathless layout: everything under it needs a signed-in, allowlisted platform admin. */
export const Route = createFileRoute('/_app')({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isSignedIn) {
      throw redirect({ to: '/sign-in', search: { redirect: location.href } })
    }
  },
  // The API answers NOT_FOUND to anyone who is not an admin; that becomes the "Not authorized" page.
  loader: ({ context }) => context.queryClient.ensureQueryData(orpc.me.queryOptions()),
  errorComponent: ({ error }) => {
    if (error instanceof ORPCError && error.code === 'NOT_FOUND') return <NotAuthorized />
    throw error
  },
  component: () => <Outlet />,
})
