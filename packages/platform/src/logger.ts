import { pino } from 'pino'
import { getContext } from './context'

/** JSON logs to stdout. Every line carries requestId / tenantId / userId when available. */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  base: undefined,
  mixin() {
    const ctx = getContext()
    return ctx ? { requestId: ctx.requestId, tenantId: ctx.tenantId, userId: ctx.userId } : {}
  },
})

export type Logger = typeof logger
