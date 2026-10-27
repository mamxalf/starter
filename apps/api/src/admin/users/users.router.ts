import { platformAdmin } from '../orpc'
import * as service from './users.service'

export const usersRouter = {
  search: platformAdmin.users.search.handler(({ context, input }) =>
    service.search(context.deps, input),
  ),
  get: platformAdmin.users.get.handler(({ context, input }) => service.get(context.deps, input)),
}
