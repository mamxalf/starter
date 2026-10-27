import { ORPCError } from '@orpc/server'
import type { Inputs, Outputs } from '@starter/contracts'
import { recordAudit } from '../../core/audit'
import { authorize, policy } from '../../core/policy'
import type { TenantScope } from '../../orpc'
import * as repo from './projects.repo'

type Project = Outputs['projects']['get']

/** Row → API shape. Keeps DB column names out of the contract. */
const toProject = (row: repo.ProjectRow): Project => ({
  id: row.id,
  name: row.name,
  description: row.description,
  createdAt: row.created_at,
})

const notFound = () => new ORPCError('NOT_FOUND', { message: 'Project not found' })

export async function list(scope: TenantScope, input: Inputs['projects']['list']) {
  const page = { page: input.page ?? 1, pageSize: input.pageSize ?? 20, q: input.q }
  const { items, total } = await scope.tx((trx) => repo.list(trx, scope.tenant.id, page))
  return { items: items.map(toProject), total }
}

export async function get(scope: TenantScope, id: string) {
  const row = await scope.tx((trx) => repo.find(trx, scope.tenant.id, id))
  if (!row) throw notFound()
  return toProject(row)
}

export async function create(scope: TenantScope, input: Inputs['projects']['create']) {
  authorize(policy.createProject(scope.role))
  return scope.tx(async (trx) => {
    const row = await repo.insert(trx, scope.tenant.id, {
      name: input.name,
      description: input.description ?? null,
    })
    await recordAudit(trx, scope.tenant.id, {
      action: 'project.created',
      targetType: 'project',
      targetId: row.id,
    })
    return toProject(row)
  })
}

export async function update(scope: TenantScope, input: Inputs['projects']['update']) {
  authorize(policy.updateProject(scope.role))
  const row = await scope.tx((trx) =>
    repo.update(trx, scope.tenant.id, input.id, {
      name: input.name,
      description: input.description ?? null,
    }),
  )
  if (!row) throw notFound()
  return toProject(row)
}

export async function remove(scope: TenantScope, id: string) {
  authorize(policy.deleteProject(scope.role), 'Only admins can delete projects')
  await scope.tx(async (trx) => {
    if (!(await repo.remove(trx, scope.tenant.id, id))) throw notFound()
    await recordAudit(trx, scope.tenant.id, {
      action: 'project.deleted',
      targetType: 'project',
      targetId: id,
    })
  })
  return { ok: true as const }
}
