import { type CreateTableBuilder, type Kysely, sql } from 'kysely'

// biome-ignore lint/suspicious/noExplicitAny: migrations must not depend on generated types
export type MigrationDb = Kysely<any>

/** id (uuid, generated in app as UUIDv7) + created_at + updated_at */
export function withBaseColumns<T extends string>(table: CreateTableBuilder<T, never>) {
  return table
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
}

/**
 * Row Level Security safety net for a tenant-scoped table.
 * FORCE makes the policy apply to the table owner too (the app role owns the tables).
 */
export async function enableTenantRls(db: MigrationDb, table: string): Promise<void> {
  const t = sql.table(table)
  const check = sql`tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    or current_setting('app.bypass_rls', true) = 'on'`
  await sql`alter table ${t} enable row level security`.execute(db)
  await sql`alter table ${t} force row level security`.execute(db)
  await sql`create policy tenant_isolation on ${t} using (${check}) with check (${check})`.execute(
    db,
  )
}
