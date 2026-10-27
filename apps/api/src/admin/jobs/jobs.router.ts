import { platformAdmin } from '../orpc'
import * as service from './jobs.service'

export const jobsRouter = {
  listFailed: platformAdmin.jobs.listFailed.handler(({ context, input }) =>
    service.listFailed(context.deps, input),
  ),
  retry: platformAdmin.jobs.retry.handler(({ context, input }) =>
    service.retry(context.deps, context.user, input),
  ),
}
