import { authed, tenantRead, tenantWrite } from '../../orpc'
import * as service from './tenants.service'

export const tenantsRouter = {
  create: authed.tenants.create.handler(({ context, input }) =>
    service.createTenant(context.deps, context.user, input),
  ),

  current: tenantRead.tenants.current.handler(({ context }) => ({
    tenant: service.toTenant(context.tenant),
    role: context.role,
    subscriptionStatus: context.subscriptionStatus,
  })),

  invite: tenantWrite.tenants.invite.handler(({ context, input }) =>
    service.invite(context.deps, context, context.user, input),
  ),

  listInvitations: tenantRead.tenants.listInvitations.handler(({ context }) =>
    service.listInvitations(context),
  ),

  acceptInvitation: authed.tenants.acceptInvitation.handler(({ context, input }) =>
    service.acceptInvitation(context.deps, context.user, input.token),
  ),
}
