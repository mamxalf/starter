import { describeAuthPortContract } from '../testing'
import { fakeAuth } from './fake'

describeAuthPortContract('fake', async () => {
  const port = fakeAuth({ user_1: { email: 'ana@example.com', emailVerified: true } })
  return {
    port,
    externalId: 'user_1',
    expectedEmail: 'ana@example.com',
    validRequest: () =>
      new Request('http://localhost/', { headers: { authorization: port.tokenFor('user_1') } }),
  }
})

// To verify the Clerk adapter, add a test that builds a real session token from a
// Clerk development instance and runs the same suite:
//   describeAuthPortContract('clerk', async () => ({ port: clerkAuth({...}), ... }))
