import { describe, expect, it } from 'vitest'
import { atLeast, authorize, policy } from './policy'

describe('policy', () => {
  it('ranks roles owner > admin > member', () => {
    expect(atLeast('owner', 'admin')).toBe(true)
    expect(atLeast('admin', 'admin')).toBe(true)
    expect(atLeast('member', 'admin')).toBe(false)
  })

  it('only admins and owners invite or delete', () => {
    expect(policy.inviteMembers('member')).toBe(false)
    expect(policy.inviteMembers('admin')).toBe(true)
    expect(policy.deleteProject('member')).toBe(false)
    expect(policy.createProject('member')).toBe(true)
  })

  it('authorize throws FORBIDDEN', () => {
    expect(() => authorize(false)).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }))
    expect(() => authorize(true)).not.toThrow()
  })
})
