import { createLimiter } from '../../core/rate-limit'
import { authed, tenantRead, tenantWrite } from '../../orpc'
import * as service from './tenants.service'

const limitInvite = createLimiter({ max: 10 })
const limitAccept = createLimiter({ max: 10 })

export const tenantsRouter = {
  create: authed.tenants.create.handler(({ context, input }) =>
    service.createTenant(context.deps, context.user, input),
  ),

  current: tenantRead.tenants.current.handler(({ context }) => ({
    tenant: service.toTenant(context.tenant),
    role: context.role,
    subscriptionStatus: context.subscriptionStatus,
  })),

  invite: tenantWrite.tenants.invite
    .use(({ context, next }) => {
      limitInvite(context.user.id)
      return next()
    })
    .handler(({ context, input }) => service.invite(context.deps, context, context.user, input)),

  listInvitations: tenantRead.tenants.listInvitations.handler(({ context }) =>
    service.listInvitations(context),
  ),

  acceptInvitation: authed.tenants.acceptInvitation
    .use(({ context, next }) => {
      limitAccept(context.user.id)
      return next()
    })
    .handler(({ context, input }) =>
      service.acceptInvitation(context.deps, context.user, input.token),
    ),
}
