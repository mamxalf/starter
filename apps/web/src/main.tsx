import { AuthProvider, useClientAuth } from '@starter/auth/react'
import { restoreTheme } from '@starter/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { setAuthorizationGetter } from './lib/api'
import { routeTree } from './routeTree.gen'
import './styles.css'

restoreTheme()

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
})

const router = createRouter({
  routeTree,
  context: { queryClient, auth: undefined! },
  defaultPreload: 'intent', // start loading a route's data when the user hovers its link
  defaultPreloadStaleTime: 0, // let TanStack Query decide freshness
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function App() {
  const auth = useClientAuth()
  setAuthorizationGetter(auth.getAuthorization)

  // Re-run route guards when the user signs in or out.
  // biome-ignore lint/correctness/useExhaustiveDependencies: isSignedIn is the trigger, not a value used inside
  useEffect(() => {
    if (auth.isLoaded) void router.invalidate()
  }, [auth.isLoaded, auth.isSignedIn])

  if (!auth.isLoaded) return null
  return <RouterProvider router={router} context={{ auth }} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider
      provider={import.meta.env.VITE_AUTH_PROVIDER === 'clerk' ? 'clerk' : 'dev'}
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
    >
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </AuthProvider>
  </StrictMode>,
)
