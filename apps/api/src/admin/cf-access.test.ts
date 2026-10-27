import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { beforeAll, describe, expect, it } from 'vitest'
import { createCfAccessVerifier } from './cf-access'

const TEAM = 'acme.cloudflareaccess.com'
const AUD = 'aud-tag-123'

let verify: (request: Request) => Promise<boolean>
let sign: (claims: { iss?: string; aud?: string; exp?: string }, key?: CryptoKey) => Promise<string>

const withToken = (token?: string) =>
  new Request('http://admin.test/', {
    headers: token ? { 'cf-access-jwt-assertion': token } : {},
  })

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256')
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' }
  verify = createCfAccessVerifier({
    teamDomain: TEAM,
    audience: AUD,
    keys: createLocalJWKSet({ keys: [jwk] }),
  })
  sign = (claims, key = privateKey) =>
    new SignJWT({ email: 'boss@example.com' })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(claims.iss ?? `https://${TEAM}`)
      .setAudience(claims.aud ?? AUD)
      .setIssuedAt()
      .setExpirationTime(claims.exp ?? '5m')
      .sign(key)
})

describe('createCfAccessVerifier', () => {
  it('accepts a token for this team and application', async () => {
    expect(await verify(withToken(await sign({})))).toBe(true)
  })

  it('rejects a missing header and garbage', async () => {
    expect(await verify(withToken())).toBe(false)
    expect(await verify(withToken('not-a-jwt'))).toBe(false)
  })

  it('rejects another application (audience)', async () => {
    expect(await verify(withToken(await sign({ aud: 'someone-else' })))).toBe(false)
  })

  it('rejects another team (issuer)', async () => {
    expect(await verify(withToken(await sign({ iss: 'https://evil.cloudflareaccess.com' })))).toBe(
      false,
    )
  })

  it('rejects an expired token', async () => {
    expect(await verify(withToken(await sign({ exp: '-1m' })))).toBe(false)
  })

  it('rejects a token signed with a different key', async () => {
    const other = await generateKeyPair('RS256')
    expect(await verify(withToken(await sign({}, other.privateKey)))).toBe(false)
  })
})
