/**
 * Client-side auth. App code imports ONLY from here (never from '@clerk/react'),
 * so changing provider touches this folder alone.
 */
import { ClerkProvider, SignIn, UserButton, useAuth } from '@clerk/react'
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react'

export type ClientAuth = {
  provider: 'clerk' | 'dev'
  isLoaded: boolean
  isSignedIn: boolean
  /** Credential for API calls, sent as `authorization: <value>`. */
  getAuthorization: () => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<ClientAuth | null>(null)

export function useClientAuth(): ClientAuth {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useClientAuth must be used inside <AuthProvider>')
  return auth
}

export function AuthProvider(props: {
  provider: 'clerk' | 'dev'
  publishableKey?: string
  children: ReactNode
}) {
  if (props.provider === 'dev') return <DevAuthProvider>{props.children}</DevAuthProvider>
  if (!props.publishableKey) throw new Error('VITE_CLERK_PUBLISHABLE_KEY is not set')
  return (
    <ClerkProvider publishableKey={props.publishableKey} afterSignOutUrl="/sign-in">
      <ClerkBridge>{props.children}</ClerkBridge>
    </ClerkProvider>
  )
}

function ClerkBridge({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const value = useMemo<ClientAuth>(
    () => ({
      provider: 'clerk',
      isLoaded: auth.isLoaded,
      isSignedIn: Boolean(auth.isSignedIn),
      getAuthorization: async () => {
        const token = await auth.getToken()
        return token ? `Bearer ${token}` : null
      },
      signOut: () => auth.signOut(),
    }),
    [auth],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// ── Dev provider: pairs with AUTH_PROVIDER=fake on the API. Never used in production. ──
const DEV_KEY = 'dev-auth-email'

function readDevEmail(): string | null {
  try {
    return localStorage.getItem(DEV_KEY)
  } catch {
    return null
  }
}

const DevSignInContext = createContext<(email: string) => void>(() => {})

function DevAuthProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState(readDevEmail)
  const value = useMemo<ClientAuth>(
    () => ({
      provider: 'dev',
      isLoaded: true,
      isSignedIn: Boolean(email),
      getAuthorization: async () => (email ? `Bearer fake:${email}` : null),
      signOut: async () => {
        try {
          localStorage.removeItem(DEV_KEY)
        } catch {}
        setEmail(null)
      },
    }),
    [email],
  )
  const signIn = (next: string) => {
    try {
      localStorage.setItem(DEV_KEY, next)
    } catch {}
    setEmail(next)
  }
  return (
    <DevSignInContext.Provider value={signIn}>
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    </DevSignInContext.Provider>
  )
}

/** Sign-in UI, mounted inside OUR /sign-in route. */
export function SignInView(props: { redirectTo?: string; onSignedIn?: () => void }) {
  const auth = useClientAuth()
  const devSignIn = useContext(DevSignInContext)
  if (auth.provider === 'clerk') {
    return <SignIn routing="hash" forceRedirectUrl={props.redirectTo ?? '/'} />
  }
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        const email = String(new FormData(e.currentTarget).get('email') ?? '').trim()
        if (email) {
          devSignIn(email)
          props.onSignedIn?.()
        }
      }}
    >
      <p className="text-sm text-muted-foreground">Dev sign-in (AUTH_PROVIDER=fake)</p>
      <input
        name="email"
        type="email"
        required
        placeholder="you@example.com"
        className="h-10 rounded-ui border-ui bg-surface px-3"
      />
      <button
        type="submit"
        className="h-10 rounded-ui border-ui bg-primary text-primary-foreground"
      >
        Sign in
      </button>
    </form>
  )
}

export function UserMenu() {
  const auth = useClientAuth()
  if (auth.provider === 'clerk') return <UserButton />
  return (
    <button type="button" className="text-sm underline" onClick={() => void auth.signOut()}>
      Sign out
    </button>
  )
}
