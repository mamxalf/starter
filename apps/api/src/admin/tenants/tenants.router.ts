import { platformAdmin } from '../orpc'
import * as service from './tenants.service'

export const tenantsRouter = {
  list: platformAdmin.tenants.list.handler(({ context, input }) =>
    service.list(context.deps, input),
  ),
  get: platformAdmin.tenants.get.handler(({ context, input }) => service.get(context.deps, input)),
  extendTrial: platformAdmin.tenants.extendTrial.handler(({ context, input }) =>
    service.extendTrial(context.deps, context.user, input),
  ),
  changePlan: platformAdmin.tenants.changePlan.handler(({ context, input }) =>
    service.changePlan(context.deps, context.user, input),
  ),
  setSuspended: platformAdmin.tenants.setSuspended.handler(({ context, input }) =>
    service.setSuspended(context.deps, context.user, input),
  ),
}
