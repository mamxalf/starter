import { createFileRoute, redirect } from '@tanstack/react-router'
import { orpc } from '../../lib/api'

/** "/" sends you to your first workspace, or to onboarding if you have none. */
export const Route = createFileRoute('/_app/')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(orpc.me.get.queryOptions())
    const first = me.memberships[0]
    if (!first) throw redirect({ to: '/onboarding' })
    throw redirect({ to: '/$tenant/projects', params: { tenant: first.slug } })
  },
})
