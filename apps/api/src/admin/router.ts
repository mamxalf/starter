import { auditRouter } from './audit/audit.router'
import { jobsRouter } from './jobs/jobs.router'
import { adminBase, platformAdmin } from './orpc'
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
})

export type AdminRouter = typeof adminRouter
