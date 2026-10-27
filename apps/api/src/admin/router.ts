import { adminBase, platformAdmin } from './orpc'

export const adminRouter = adminBase.router({
  me: platformAdmin.me.handler(({ context }) => ({
    email: context.user.email,
    name: context.user.name,
  })),
})

export type AdminRouter = typeof adminRouter
