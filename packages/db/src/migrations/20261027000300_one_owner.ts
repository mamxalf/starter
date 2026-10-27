import { sql } from 'kysely'
import type { MigrationDb } from './_helpers'

/** A tenant has exactly one owner: ownership moves only through an atomic transfer. */
export async function up(db: MigrationDb): Promise<void> {
  await sql`create unique index memberships_one_owner on memberships (tenant_id) where role = 'owner'`.execute(
    db,
  )
}

export async function down(db: MigrationDb): Promise<void> {
  await sql`drop index memberships_one_owner`.execute(db)
}
