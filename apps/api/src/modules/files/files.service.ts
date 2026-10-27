import { ORPCError } from '@orpc/server'
import type { Inputs } from '@starter/contracts'
import { newId, withSystem } from '@starter/db'
import { authorize, policy } from '../../core/policy'
import type { User } from '../../core/users'
import type { Deps } from '../../deps'
import type { TenantScope } from '../../orpc'
import * as repo from './files.repo'

const STALE_AFTER_MS = 24 * 60 * 60 * 1000

/**
 * Upload flow (files never pass through the API server):
 *  1. createUpload: reserve a `pending` row, return a presigned PUT URL (size + type are signed)
 *  2. browser PUTs the file straight to storage
 *  3. completeUpload: verify the object exists with the declared size → `ready`
 *  4. an hourly job deletes `pending` rows (and objects) older than 24h
 */
export async function createUpload(
  deps: Deps,
  scope: TenantScope,
  user: User,
  input: Inputs['files']['createUpload'],
) {
  authorize(policy.uploadFiles(scope.role))
  const fileId = newId()
  const key = `tenants/${scope.tenant.id}/${fileId}`
  await scope.tx((trx) =>
    repo.insertPending(trx, {
      id: fileId,
      tenantId: scope.tenant.id,
      key,
      filename: input.filename,
      contentType: input.contentType,
      size: input.size,
      uploadedBy: user.id,
    }),
  )
  const upload = await deps.storage.presignUpload({
    key,
    contentType: input.contentType,
    size: input.size,
  })
  return { fileId, upload }
}

export async function completeUpload(deps: Deps, scope: TenantScope, fileId: string) {
  const file = await scope.tx((trx) => repo.find(trx, scope.tenant.id, fileId))
  if (!file) throw new ORPCError('NOT_FOUND', { message: 'File not found' })
  if (file.status === 'ready') return { fileId, status: 'ready' as const }

  const object = await deps.storage.head(file.key)
  if (!object) throw new ORPCError('BAD_REQUEST', { message: 'Upload not found in storage' })
  if (object.size !== file.size) {
    await deps.storage.delete(file.key)
    throw new ORPCError('BAD_REQUEST', { message: 'Uploaded size does not match' })
  }
  await scope.tx((trx) => repo.markReady(trx, scope.tenant.id, fileId))
  return { fileId, status: 'ready' as const }
}

export async function downloadUrl(deps: Deps, scope: TenantScope, fileId: string) {
  const file = await scope.tx((trx) => repo.find(trx, scope.tenant.id, fileId))
  if (file?.status !== 'ready') {
    throw new ORPCError('NOT_FOUND', { message: 'File not found' })
  }
  return { url: await deps.storage.presignDownload(file.key) }
}

export async function cleanupPendingUploads(deps: Deps, now = new Date()): Promise<number> {
  return withSystem(deps.db, async (trx) => {
    const stale = await repo.staleUploads(trx, new Date(now.getTime() - STALE_AFTER_MS))
    for (const file of stale) await deps.storage.delete(file.key)
    if (stale.length)
      await repo.deleteByIds(
        trx,
        stale.map((f) => f.id),
      )
    return stale.length
  })
}
