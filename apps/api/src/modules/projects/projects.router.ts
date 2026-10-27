import { tenantRead, tenantWrite } from '../../orpc'
import * as service from './projects.service'

// Reads use tenantRead; mutations use tenantWrite (blocked while the subscription is suspended).
export const projectsRouter = {
  list: tenantRead.projects.list.handler(({ context, input }) => service.list(context, input)),
  get: tenantRead.projects.get.handler(({ context, input }) => service.get(context, input.id)),
  create: tenantWrite.projects.create.handler(({ context, input }) =>
    service.create(context, input),
  ),
  update: tenantWrite.projects.update.handler(({ context, input }) =>
    service.update(context, input),
  ),
  remove: tenantWrite.projects.remove.handler(({ context, input }) =>
    service.remove(context, input.id),
  ),
}
