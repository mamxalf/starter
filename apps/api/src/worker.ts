import { createPgBossQueue } from '@starter/platform/jobs'
import { logger } from '@starter/platform/logger'
import { createDeps } from './deps'
import { loadEnv } from './env'
import { jobHandlers } from './jobs/handlers'
import { onShutdown } from './shutdown'

/** Same image as the API, different command: `node dist/worker.js`. */
const env = loadEnv()

if (env.SENTRY_DSN) {
  const Sentry = await import('@sentry/node')
  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV })
}

const queue = createPgBossQueue(env.DATABASE_URL)
const deps = createDeps(env, queue)

await queue.work(jobHandlers(deps))
logger.info('worker started')

onShutdown(async () => {
  await queue.stop()
  await deps.db.destroy()
})
