import { createPgBossQueue } from '@starter/platform/jobs'
import { logger } from '@starter/platform/logger'
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
const app = await buildApp(deps, { webDist: env.WEB_DIST, adminDist: env.ADMIN_DIST })

// Dev convenience: one process runs jobs too. In production the worker role does this.
if (env.NODE_ENV === 'development') await queue.work(jobHandlers(deps))

if (env.SENTRY_DSN) {
  const Sentry = await import('@sentry/node')
  Sentry.setupFastifyErrorHandler(app)
}

// Dev convenience so a fresh `docker compose up` needs no bucket setup step. Never blocks boot.
if (env.NODE_ENV === 'development') {
  await deps.storage.ensureBucket().catch((err) => {
    logger.warn({ err }, 'could not ensure the dev storage bucket (is the storage service up?)')
  })
}

onShutdown(async () => {
  await app.close()
  await queue.stop()
  await deps.db.destroy()
})

await app.listen({ port: env.PORT, host: '0.0.0.0' })
