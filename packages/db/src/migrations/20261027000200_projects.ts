import { enableTenantRls, type MigrationDb, withBaseColumns } from './_helpers'

// Example tenant-scoped module. `pnpm gen module <name>` produces this same shape.
export async function up(db: MigrationDb): Promise<void> {
  await withBaseColumns(db.schema.createTable('projects'))
    .addColumn('tenant_id', 'uuid', (c) => c.notNull().references('tenants.id').onDelete('cascade'))
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('description', 'text')
    .execute()
  await db.schema
    .createIndex('projects_tenant_created')
    .on('projects')
    .columns(['tenant_id', 'created_at'])
    .execute()
  await enableTenantRls(db, 'projects')
}

export async function down(db: MigrationDb): Promise<void> {
  await db.schema.dropTable('projects').execute()
}
