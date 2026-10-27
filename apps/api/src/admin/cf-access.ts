import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from 'jose'

/**
 * Cloudflare Access puts a signed JWT in the `Cf-Access-Jwt-Assertion` header. Verify it against the
 * team's JWKS (keys rotate, so they are fetched and cached by `jose`, never hard-coded), checking the
 * issuer (the team domain) and audience (the Access application's AUD tag).
 * https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
 */
export function createCfAccessVerifier(config: {
  teamDomain: string
  audience: string
  /** Key resolver override, for tests. Defaults to the team's remote JWKS. */
  keys?: JWTVerifyGetKey
}) {
  const issuer = `https://${config.teamDomain}`
  const keys = config.keys ?? createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`))

  return async (request: Request): Promise<boolean> => {
    const token = request.headers.get('cf-access-jwt-assertion')
    if (!token) return false
    try {
      await jwtVerify(token, keys, { issuer, audience: config.audience })
      return true
    } catch {
      return false
    }
  }
}
