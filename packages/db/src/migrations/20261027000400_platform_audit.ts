import { sql } from 'kysely'
import type { MigrationDb } from './_helpers'

/**
 * Audit trail of platform-admin actions (apps/api/src/admin). Not tenant data, so there is no
 * tenant_id match; RLS here is "system only": tenant transactions (withTenant) see no rows,
 * only withSystem does. Rows are append-only, hence no updated_at.
 */
export async function up(db: MigrationDb): Promise<void> {
  await db.schema
    .createTable('platform_audit_events')
    .addColumn('id', 'uuid', (c) => c.primaryKey())
    .addColumn('actor_id', 'uuid', (c) => c.references('users.id').onDelete('set null'))
    .addColumn('action', 'text', (c) => c.notNull())
    .addColumn('target_type', 'text')
    .addColumn('target_id', 'text')
    .addColumn('tenant_id', 'uuid', (c) => c.references('tenants.id').onDelete('set null'))
    .addColumn('reason', 'text', (c) => c.notNull())
    .addColumn('metadata', 'jsonb', (c) => c.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute()
  await db.schema
    .createIndex('platform_audit_events_created')
    .on('platform_audit_events')
    .column('created_at')
    .execute()

  const check = sql`current_setting('app.bypass_rls', true) = 'on'`
  await sql`alter table platform_audit_events enable row level security`.execute(db)
  await sql`alter table platform_audit_events force row level security`.execute(db)
  await sql`create policy system_only on platform_audit_events using (${check}) with check (${check})`.execute(
    db,
  )
}

export async function down(db: MigrationDb): Promise<void> {
  await db.schema.dropTable('platform_audit_events').execute()
}
