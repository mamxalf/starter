import { AuthProvider, useClientAuth } from '@starter/auth/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from '@/components/ui/sonner'
import { setAuthorizationGetter } from './lib/api'
import { routeTree } from './routeTree.gen'
import './styles.css'

// Light/dark follows the system; there is deliberately no theme switcher.
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')
const applyTheme = () => document.documentElement.classList.toggle('dark', prefersDark.matches)
applyTheme()
prefersDark.addEventListener('change', applyTheme)

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: false } },
})

const router = createRouter({
  routeTree,
  context: { queryClient, auth: undefined! },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
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
    if (auth.isLoaded) {
      queryClient.clear()
      void router.invalidate()
    }
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
        <Toaster richColors />
      </QueryClientProvider>
    </AuthProvider>
  </StrictMode>,
)
