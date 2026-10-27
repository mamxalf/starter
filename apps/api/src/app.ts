import { randomUUID } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import { onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fastify'
import { sql } from '@starter/db'
import { runWithContext } from '@starter/platform/context'
import { logger } from '@starter/platform/logger'
import Fastify, { type FastifyRequest } from 'fastify'
import { adminRouter } from './admin/router'
import type { Deps } from './deps'
import type { BaseContext } from './orpc'
import { router } from './router'

export type AppOptions = {
  /** Built SPA directory to serve same-origin (production). */
  webDist?: string
  /** Built admin SPA, served instead of the web SPA when the request host is ADMIN_HOST. */
  adminDist?: string
  /** Requests per minute per IP. Defaults to 300. */
  rateLimitMax?: number
}

/** Fastify request → web Request, so AuthPort adapters never see Fastify. */
function toWebRequest(req: FastifyRequest): Request {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value)
    else if (Array.isArray(value)) for (const v of value) headers.append(key, v)
  }
  return new Request(`${req.protocol}://${req.host}${req.url}`, { method: 'GET', headers })
}

export async function buildApp(deps: Deps, options: AppOptions = {}) {
  const app = Fastify({
    loggerInstance: logger,
    genReqId: (req) => (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
    trustProxy: true,
  })

  // CSP is left to the SPA/CDN layer; enable and tune it once your asset origins are fixed.
  await app.register(helmet, { contentSecurityPolicy: false })
  // Keyed by IP only: any request header is client-controlled and would let callers dodge the limit.
  // Per-user limits for sensitive procedures live in the routers (core/rate-limit.ts).
  await app.register(rateLimit, {
    max: options.rateLimitMax ?? 300,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
  })

  // Liveness: the process is up. Readiness: dependencies are reachable (used by Kamal).
  app.get('/healthz', async () => ({ ok: true }))
  app.get('/readyz', async (_req, reply) => {
    try {
      await sql`select 1`.execute(deps.db)
      return { ok: true }
    } catch {
      return reply.status(503).send({ ok: false })
    }
  })

  const logRpcError = (error: unknown) => {
    const status = (error as { status?: number }).status ?? 500
    if (status >= 500) logger.error({ err: error }, 'rpc error')
  }

  /** One RPC mount: web Request for AuthPort, locale from Accept-Language, request context for logs/audit. */
  const mountRpc = (
    prefix: `/${string}`,
    handler: RPCHandler<BaseContext>,
    allow?: (req: FastifyRequest) => boolean,
  ) => {
    app.all(`${prefix}/*`, async (req, reply) => {
      if (allow && !allow(req)) return reply.status(404).send({ message: 'Not found' })
      const request = toWebRequest(req)
      const locale = req.headers['accept-language']?.toString().startsWith('en') ? 'en' : 'id'
      await runWithContext({ requestId: String(req.id), locale }, async () => {
        const { matched } = await handler.handle(req, reply, {
          prefix,
          context: { deps, request },
        })
        if (!matched) reply.status(404).send({ message: 'Not found' })
      })
    })
  }

  mountRpc('/api/rpc', new RPCHandler(router, { interceptors: [onError(logRpcError)] }))

  // Platform admin API: mounted only when PLATFORM_ADMINS is set, and in production only on ADMIN_HOST.
  // Anything else answers 404 like an unknown route.
  if (deps.admin.platformAdmins.length > 0) {
    const adminHost = deps.admin.adminHost?.toLowerCase()
    mountRpc(
      '/api/admin/rpc',
      new RPCHandler(adminRouter, { interceptors: [onError(logRpcError)] }),
      (req) => !adminHost || req.host.toLowerCase() === adminHost,
    )
  }

  const webDist = options.webDist ? resolve(options.webDist) : undefined
  const adminDist = options.adminDist ? resolve(options.adminDist) : undefined
  if (webDist && existsSync(webDist)) {
    // `serve: false` keeps only reply.sendFile(root, ...): the handler below picks the SPA by Host, so
    // a file of one app can never be served on the other app's host.
    await app.register(fastifyStatic, { root: webDist, serve: false })

    const adminHost = deps.admin.adminHost?.toLowerCase()
    const spaRoot = (req: FastifyRequest) => {
      if (adminHost === undefined || String(req.host).toLowerCase() !== adminHost) return webDist
      return adminDist && existsSync(adminDist) ? adminDist : undefined // admin host, no admin build
    }

    // Files first, otherwise the SPA's index.html (TanStack Router takes over). /api/* is never an SPA.
    app.get('/*', async (req, reply) => {
      const root = spaRoot(req)
      const path = req.url.split('?')[0] ?? '/'
      if (!root || path.startsWith('/api/')) return reply.status(404).send({ message: 'Not found' })
      try {
        const file = resolve(root, `.${decodeURIComponent(path)}`)
        if (path !== '/' && file.startsWith(root + sep) && statSync(file).isFile()) {
          return reply.sendFile(relative(root, file), root)
        }
      } catch {
        // missing file, bad encoding or a path that is not one: fall through to the SPA
      }
      return reply.sendFile('index.html', root)
    })
    app.setNotFoundHandler((_req, reply) => reply.status(404).send({ message: 'Not found' }))
  }

  return app
}
