/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTH_PROVIDER?: 'clerk' | 'dev'
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string
}
