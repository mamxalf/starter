import { UserMenu } from '@starter/auth/react'
import { m, setLocale } from '@starter/i18n'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router'
import { LocaleSwitcher } from '../components/locale-switcher'
import { TenantSwitcher } from '../components/tenant-switcher'
import { ThemeSwitcher } from '../components/theme-switcher'
import { orpc } from '../lib/api'

/** Pathless layout: every route under it requires a signed-in user. */
export const Route = createFileRoute('/_app')({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isSignedIn) {
      throw redirect({ to: '/sign-in', search: { redirect: location.href } })
    }
  },
  loader: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(orpc.me.get.queryOptions())
    if (me.user.locale) setLocale(me.user.locale, { reload: false })
    return me
  },
  component: AppLayout,
})

function AppLayout() {
  // Read from the query (not loader data) so invalidating `me` updates the tenant list.
  const { data: me } = useSuspenseQuery(orpc.me.get.queryOptions())
  return (
    <div className="min-h-dvh">
      <header className="flex flex-wrap items-center gap-3 border-b-(length:--border-w) border-border px-4 py-3">
        <Link to="/" className="font-display text-lg font-bold">
          {m.app_name()}
        </Link>
        <TenantSwitcher tenants={me.memberships} />
        <div className="ml-auto flex items-center gap-3">
          <LocaleSwitcher />
          <ThemeSwitcher />
          <UserMenu />
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4">
        <Outlet />
      </main>
    </div>
  )
}
