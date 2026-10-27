import { createClerkClient } from '@clerk/backend'
import type { AuthPort } from '../port'

export type ClerkAuthConfig = {
  secretKey: string
  publishableKey: string
  /** Origins allowed to send session tokens, e.g. ['https://app.example.com']. */
  authorizedParties?: string[]
}

export function clerkAuth(config: ClerkAuthConfig): AuthPort {
  const clerk = createClerkClient({
    secretKey: config.secretKey,
    publishableKey: config.publishableKey,
  })

  return {
    provider: 'clerk',

    async authenticate(request) {
      try {
        const state = await clerk.authenticateRequest(request, {
          authorizedParties: config.authorizedParties,
        })
        if (!state.isAuthenticated) return null
        const { userId } = state.toAuth()
        return userId ? { externalId: userId } : null
      } catch {
        return null
      }
    },

    async getProfile(externalId) {
      const user = await clerk.users.getUser(externalId)
      const primary = user.primaryEmailAddress
      if (!primary) return null
      return {
        email: primary.emailAddress.toLowerCase(),
        emailVerified: primary.verification?.status === 'verified',
        name: user.fullName ?? undefined,
      }
    },
  }
}
