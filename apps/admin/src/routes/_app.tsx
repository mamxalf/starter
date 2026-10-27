import { ORPCError } from '@orpc/client'
import { useClientAuth } from '@starter/auth/react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router'
import { SearchIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { CommandPalette } from '@/components/command-palette'
import { NotAuthorized } from '@/components/not-authorized'
import { Button } from '@/components/ui/button'
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
  component: AppLayout,
})

const NAV = [
  { to: '/tenants', label: 'Tenants' },
  { to: '/users', label: 'Users' },
  { to: '/jobs', label: 'Failed jobs' },
  { to: '/audit', label: 'Audit log' },
] as const

function AppLayout() {
  const auth = useClientAuth()
  const { data: me } = useSuspenseQuery(orpc.me.queryOptions())
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="min-h-dvh">
      <header className="flex flex-wrap items-center gap-4 border-b px-4 py-3">
        <Link to="/tenants" className="font-semibold">
          Platform admin
        </Link>
        <nav className="flex flex-wrap gap-1 text-sm">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-md px-2 py-1 text-muted-foreground hover:bg-muted"
              activeProps={{ className: 'bg-muted font-medium text-foreground' }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPaletteOpen(true)}>
            <SearchIcon />
            Search
            <kbd className="ml-2 rounded border px-1 text-xs text-muted-foreground">Ctrl K</kbd>
          </Button>
          <span className="hidden text-sm text-muted-foreground sm:inline">{me.email}</span>
          <Button variant="ghost" size="sm" onClick={() => void auth.signOut()}>
            Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4">
        <Outlet />
      </main>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}
