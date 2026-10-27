import { tenantRead, tenantWrite } from '../../orpc'
import * as service from './members.service'

export const membersRouter = {
  list: tenantRead.members.list.handler(({ context }) => service.list(context)),
  changeRole: tenantWrite.members.changeRole.handler(({ context, input }) =>
    service.changeRole(context, input),
  ),
  remove: tenantWrite.members.remove.handler(({ context, input }) =>
    service.remove(context, input),
  ),
  leave: tenantWrite.members.leave.handler(({ context }) => service.leave(context, context.user)),
  transferOwnership: tenantWrite.members.transferOwnership.handler(({ context, input }) =>
    service.transferOwnership(context, context.user, input),
  ),
}
