import { auditRouter } from './audit/audit.router'
import { jobsRouter } from './jobs/jobs.router'
import { adminBase, platformAdmin } from './orpc'
import { plansRouter } from './plans/plans.router'
import { tenantsRouter } from './tenants/tenants.router'
import { usersRouter } from './users/users.router'

export const adminRouter = adminBase.router({
  me: platformAdmin.me.handler(({ context }) => ({
    email: context.user.email,
    name: context.user.name,
  })),
  tenants: tenantsRouter,
  users: usersRouter,
  audit: auditRouter,
  jobs: jobsRouter,
  plans: plansRouter,
})

export type AdminRouter = typeof adminRouter
