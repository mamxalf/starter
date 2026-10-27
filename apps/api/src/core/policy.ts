import { ORPCError } from '@orpc/server'
import type { Role } from '@starter/contracts'

/**
 * Authorization as plain functions (Pundit-style): easy to read, easy to unit test.
 * Add a rule here when a module needs one; keep business modules free of role checks.
 */
const RANK: Record<Role, number> = { member: 1, admin: 2, owner: 3 }

export const atLeast = (role: Role, minimum: Role): boolean => RANK[role] >= RANK[minimum]

export const policy = {
  inviteMembers: (role: Role) => atLeast(role, 'admin'),
  createProject: (role: Role) => atLeast(role, 'member'),
  updateProject: (role: Role) => atLeast(role, 'member'),
  deleteProject: (role: Role) => atLeast(role, 'admin'),
  uploadFiles: (role: Role) => atLeast(role, 'member'),
}

export function authorize(allowed: boolean, message = 'Not allowed'): asserts allowed {
  if (!allowed) throw new ORPCError('FORBIDDEN', { message })
}
