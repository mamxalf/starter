import { createPgBossQueue } from '@starter/platform/jobs'
import { logger } from '@starter/platform/logger'
import { createDeps } from './deps'
import { loadEnv } from './env'
import { jobHandlers } from './jobs/handlers'

/** Same image as the API, different command: `node dist/worker.js`. */
const env = loadEnv()
const queue = createPgBossQueue(env.DATABASE_URL)
const deps = createDeps(env, queue)

await queue.work(jobHandlers(deps))
logger.info('worker started')

const shutdown = async () => {
  await queue.stop()
  await deps.db.destroy()
  process.exit(0)
}
process.on('SIGTERM', () => void shutdown())
process.on('SIGINT', () => void shutdown())
