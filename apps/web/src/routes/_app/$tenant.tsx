import { m, setLocale } from '@starter/i18n'
import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
import { orpc, setCurrentTenant } from '../../lib/api'

let activeSlug: string | null = null

/**
 * Tenant layout. The slug in the URL is the tenant; every API call below carries it
 * (x-tenant-slug). The API checks membership; this only drives UX.
 */
export const Route = createFileRoute('/_app/$tenant')({
  beforeLoad: ({ context, params }) => {
    if (activeSlug !== params.tenant) {
      // Tenant-scoped queries share keys across tenants, so drop them when switching.
      context.queryClient.removeQueries({ predicate: (q) => !isMeQuery(q.queryKey) })
      activeSlug = params.tenant
    }
    setCurrentTenant(params.tenant)
  },
  loader: async ({ context }) => {
    const current = await context.queryClient.ensureQueryData(orpc.tenants.current.queryOptions())
    // No personal language chosen yet: use the workspace default.
    const me = context.queryClient.getQueryData(orpc.me.get.queryKey())
    if (!me?.user.locale) setLocale(current.tenant.defaultLocale, { reload: false })
    return current
  },
  component: TenantLayout,
})

function isMeQuery(key: readonly unknown[]): boolean {
  const path = key[0]
  return Array.isArray(path) && path[0] === 'me'
}

function TenantLayout() {
  const current = Route.useLoaderData()
  const { tenant } = Route.useParams()
  return (
    <div className="flex flex-col gap-4">
      {current.subscriptionStatus === 'suspended' && (
        <div className="rounded-ui border-ui bg-danger p-3 text-sm text-danger-foreground">
          {m.tenant_suspended()}
        </div>
      )}
      <nav className="flex gap-2 text-sm">
        <Link
          to="/$tenant/projects"
          params={{ tenant }}
          className="rounded-ui px-2 py-1"
          activeProps={{ className: 'bg-muted font-semibold' }}
        >
          {m.nav_projects()}
        </Link>
        <Link
          to="/$tenant/members"
          params={{ tenant }}
          className="rounded-ui px-2 py-1"
          activeProps={{ className: 'bg-muted font-semibold' }}
        >
          {m.nav_members()}
        </Link>
      </nav>
      <Outlet />
    </div>
  )
}
