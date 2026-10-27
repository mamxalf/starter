import { platformAdmin } from '../orpc'
import * as service from './audit.service'

export const auditRouter = {
  list: platformAdmin.audit.list.handler(({ context, input }) => service.list(context.deps, input)),
}
