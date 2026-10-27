import { z } from 'zod'

export const Locale = z.enum(['id', 'en'])
export type Locale = z.infer<typeof Locale>

export const Role = z.enum(['owner', 'admin', 'member'])
export type Role = z.infer<typeof Role>

export const Slug = z
  .string()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, numbers and dashes')

export const Pagination = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
})

export const paginated = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), total: z.number().int() })

/** Header the dashboard sends on every tenant-scoped call (the slug from the URL). */
export const TENANT_HEADER = 'x-tenant-slug'
