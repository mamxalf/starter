import { oc } from '@orpc/contract'
import { z } from 'zod'
import { Pagination, paginated } from '../shared'

// Example module. `pnpm gen module <name>` creates a file shaped like this one.
export const Project = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: z.date(),
})

export const ProjectInput = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullable().default(null),
})

export const projectsContract = {
  list: oc.input(Pagination.extend({ q: z.string().trim().optional() })).output(paginated(Project)),
  get: oc.input(z.object({ id: z.uuid() })).output(Project),
  create: oc.input(ProjectInput).output(Project),
  update: oc.input(ProjectInput.extend({ id: z.uuid() })).output(Project),
  remove: oc.input(z.object({ id: z.uuid() })).output(z.object({ ok: z.literal(true) })),
}
