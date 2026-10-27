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
  manageInvitations: (role: Role) => atLeast(role, 'admin'),
  /** Only the owner hands out admin; admins can grant plain membership. */
  assignRole: (actor: Role, newRole: Role) =>
    newRole === 'admin' ? actor === 'owner' : atLeast(actor, 'admin'),
  /** An admin handles member invitations only: an admin invitation is the owner's to resend or revoke. */
  manageInvitation: (actor: Role, invitationRole: Role) =>
    actor === 'owner' || (actor === 'admin' && invitationRole === 'member'),
  /** The owner manages everyone else; an admin manages plain members only. */
  manageMember: (actor: Role, target: Role) =>
    target !== 'owner' && (actor === 'owner' || (actor === 'admin' && target === 'member')),
  transferOwnership: (role: Role) => role === 'owner',
  /** The owner cannot leave: ownership must be transferred first. */
  leaveTenant: (role: Role) => role !== 'owner',
  createProject: (role: Role) => atLeast(role, 'member'),
  updateProject: (role: Role) => atLeast(role, 'member'),
  deleteProject: (role: Role) => atLeast(role, 'admin'),
  uploadFiles: (role: Role) => atLeast(role, 'member'),
}

export function authorize(allowed: boolean, message = 'Not allowed'): asserts allowed {
  if (!allowed) throw new ORPCError('FORBIDDEN', { message })
}
