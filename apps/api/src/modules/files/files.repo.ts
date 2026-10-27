import type { DB, Transaction } from '@starter/db'

export function insertPending(
  trx: Transaction<DB>,
  values: {
    id: string
    tenantId: string
    key: string
    filename: string
    contentType: string
    size: number
    uploadedBy: string
  },
) {
  return trx
    .insertInto('files')
    .values({
      id: values.id,
      tenant_id: values.tenantId,
      key: values.key,
      filename: values.filename,
      content_type: values.contentType,
      size: values.size,
      status: 'pending',
      uploaded_by: values.uploadedBy,
    })
    .execute()
}

export function find(trx: Transaction<DB>, tenantId: string, id: string) {
  return trx
    .selectFrom('files')
    .selectAll()
    .where('tenant_id', '=', tenantId)
    .where('id', '=', id)
    .executeTakeFirst()
}

export function markReady(trx: Transaction<DB>, tenantId: string, id: string) {
  return trx
    .updateTable('files')
    .set({ status: 'ready', updated_at: new Date() })
    .where('tenant_id', '=', tenantId)
    .where('id', '=', id)
    .execute()
}

/** System-wide (caller must use withSystem): pending uploads older than the cutoff. */
export function staleUploads(trx: Transaction<DB>, olderThan: Date) {
  return trx
    .selectFrom('files')
    .select(['id', 'key'])
    .where('status', '=', 'pending')
    .where('created_at', '<', olderThan)
    .limit(500)
    .execute()
}

export function deleteByIds(trx: Transaction<DB>, ids: string[]) {
  return trx.deleteFrom('files').where('id', 'in', ids).execute()
}
