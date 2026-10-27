import type { AuthPort, ExternalProfile } from '../port'

/**
 * Header-based adapter for tests and local development without a provider account.
 * Send `authorization: Bearer fake:<externalId>`.
 *
 * - Tests register profiles up front (`register`).
 * - Dev mode (`autoRegister: true`): an externalId that is an email signs in as that email,
 *   so `pnpm dev` works before you create a Clerk app.
 *
 * The API refuses to boot with this adapter in production.
 */
export function fakeAuth(
  profiles: Record<string, ExternalProfile> = {},
  options: { autoRegister?: boolean } = {},
) {
  const registry = new Map(Object.entries(profiles))

  const lookup = (externalId: string): ExternalProfile | undefined => {
    const known = registry.get(externalId)
    if (known) return known
    if (options.autoRegister && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(externalId)) {
      return {
        email: externalId.toLowerCase(),
        emailVerified: true,
        name: externalId.split('@')[0],
      }
    }
    return undefined
  }

  const port: AuthPort & {
    register(externalId: string, profile: ExternalProfile): void
    tokenFor(externalId: string): string
  } = {
    provider: 'fake',

    async authenticate(request) {
      const header = request.headers.get('authorization') ?? ''
      const match = header.match(/^Bearer fake:(.+)$/)
      if (!match?.[1] || !lookup(match[1])) return null
      return { externalId: match[1] }
    },

    async getProfile(externalId) {
      return lookup(externalId) ?? null
    },

    register(externalId, profile) {
      registry.set(externalId, profile)
    },

    tokenFor(externalId) {
      return `Bearer fake:${externalId}`
    },
  }
  return port
}
