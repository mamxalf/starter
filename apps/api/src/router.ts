import { filesRouter } from './modules/files/files.router'
import { meRouter } from './modules/me/me.router'
import { projectsRouter } from './modules/projects/projects.router'
import { tenantsRouter } from './modules/tenants/tenants.router'
import { base } from './orpc'
// [gen:router-imports]

/** Implements the whole contract. A missing procedure is a type error. */
export const router = base.router({
  me: meRouter,
  tenants: tenantsRouter,
  projects: projectsRouter,
  files: filesRouter,
  // [gen:router]
})

export type Router = typeof router
