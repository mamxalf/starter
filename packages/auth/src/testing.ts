import { describe, expect, it } from 'vitest'
import type { AuthPort } from './port'

export type AuthContractFixture = {
  port: AuthPort
  /** A request that carries valid credentials for `externalId`. */
  validRequest: () => Promise<Request> | Request
  externalId: string
  expectedEmail: string
}

/**
 * Every AuthPort adapter must pass this suite. Run it against a new adapter
 * (e.g. Better Auth) before switching: the migration is then verified, not hoped for.
 */
export function describeAuthPortContract(name: string, setup: () => Promise<AuthContractFixture>) {
  describe(`AuthPort contract: ${name}`, () => {
    it('has a stable, non-empty provider name', async () => {
      const { port } = await setup()
      expect(port.provider).toMatch(/^[a-z][a-z0-9-]*$/)
    })

    it('returns null for a request without credentials', async () => {
      const { port } = await setup()
      expect(await port.authenticate(new Request('http://localhost/'))).toBeNull()
    })

    it('returns null (does not throw) for garbage credentials', async () => {
      const { port } = await setup()
      const request = new Request('http://localhost/', {
        headers: { authorization: 'Bearer not-a-real-token' },
      })
      expect(await port.authenticate(request)).toBeNull()
    })

    it('identifies a valid request', async () => {
      const f = await setup()
      expect(await f.port.authenticate(await f.validRequest())).toEqual({
        externalId: f.externalId,
      })
    })

    it('returns a lowercase email profile for the identity', async () => {
      const f = await setup()
      const profile = await f.port.getProfile(f.externalId)
      expect(profile?.email).toBe(f.expectedEmail)
      expect(profile?.email).toBe(profile?.email.toLowerCase())
      expect(typeof profile?.emailVerified).toBe('boolean')
    })
  })
}
