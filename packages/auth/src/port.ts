/**
 * AuthPort answers ONE question: "which identity at which provider made this request?"
 *
 * It does NOT know about our users table, tenants, memberships or roles. Those live in our DB.
 * Mapping (provider, externalId) → our user id happens in the app via `auth_identities`.
 * Swapping Clerk for Better Auth means writing a new adapter that passes the same contract tests.
 */
export interface AuthPort {
  /** Stable provider name stored in auth_identities.provider, e.g. 'clerk', 'better-auth'. */
  readonly provider: string
  /** Returns the authenticated identity, or null for anonymous/invalid requests. Never throws for bad tokens. */
  authenticate(request: Request): Promise<ExternalIdentity | null>
  /** Profile used to create or link our user on first sight. */
  getProfile(externalId: string): Promise<ExternalProfile | null>
}

export type ExternalIdentity = {
  externalId: string
}

export type ExternalProfile = {
  email: string
  /** Only verified emails may be used to link an identity to an existing user. */
  emailVerified: boolean
  name?: string
}
