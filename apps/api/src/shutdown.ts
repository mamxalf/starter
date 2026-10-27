import { logger } from '@starter/platform/logger'

const FORCE_EXIT_AFTER_MS = 10_000

/**
 * Runs `cleanup` once on SIGTERM/SIGINT, then exits. A hung close (open connection,
 * stuck job) must not stall a deploy: after 10s the process exits 1 anyway.
 */
export function onShutdown(cleanup: () => Promise<void>) {
  let started = false

  const run = async (signal: string) => {
    if (started) return
    started = true
    logger.info({ signal }, 'shutting down')

    setTimeout(() => {
      logger.error('shutdown timed out, forcing exit')
      process.exit(1)
    }, FORCE_EXIT_AFTER_MS)

    try {
      await cleanup()
      process.exit(0)
    } catch (err) {
      logger.error({ err }, 'shutdown failed')
      process.exit(1)
    }
  }

  process.on('SIGTERM', () => void run('SIGTERM'))
  process.on('SIGINT', () => void run('SIGINT'))
}
