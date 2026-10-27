import { createPgBossQueue } from '@starter/platform/jobs'
import { buildApp } from './app'
import { createDeps } from './deps'
import { loadEnv } from './env'
import { jobHandlers } from './jobs/handlers'
import { onShutdown } from './shutdown'

const env = loadEnv()

if (env.SENTRY_DSN) {
  // Works with Sentry or a self-hosted GlitchTip: only the DSN changes.
  const Sentry = await import('@sentry/node')
  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV })
}

const queue = createPgBossQueue(env.DATABASE_URL)
const deps = createDeps(env, queue)
const app = await buildApp(deps, { webDist: env.WEB_DIST })

// Dev convenience: one process runs jobs too. In production the worker role does this.
if (env.NODE_ENV === 'development') await queue.work(jobHandlers(deps))

if (env.SENTRY_DSN) {
  const Sentry = await import('@sentry/node')
  Sentry.setupFastifyErrorHandler(app)
}

onShutdown(async () => {
  await app.close()
  await queue.stop()
  await deps.db.destroy()
})

await app.listen({ port: env.PORT, host: '0.0.0.0' })
