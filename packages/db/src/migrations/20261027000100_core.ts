import { sql } from 'kysely'
import { enableTenantRls, type MigrationDb, withBaseColumns } from './_helpers'

export async function up(db: MigrationDb): Promise<void> {
  // ── Identity & tenancy ─────────────────────────────────────────────
  await withBaseColumns(db.schema.createTable('tenants'))
    .addColumn('slug', 'text', (c) => c.notNull().unique())
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('default_locale', 'text', (c) => c.notNull().defaultTo('id'))
    .addColumn('custom_domain', 'text', (c) => c.unique())
    .execute()

  await withBaseColumns(db.schema.createTable('users'))
    .addColumn('email', 'text', (c) => c.notNull().unique())
    .addColumn('name', 'text')
    .addColumn('locale', 'text')
    .execute()

  // Maps an auth provider's user id to OUR user id. Provider ids are never foreign keys.
  await withBaseColumns(db.schema.createTable('auth_identities'))
    .addColumn('user_id', 'uuid', (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('provider', 'text', (c) => c.notNull())
    .addColumn('external_id', 'text', (c) => c.notNull())
    .addUniqueConstraint('auth_identities_provider_external_id', ['provider', 'external_id'])
    .execute()

  await withBaseColumns(db.schema.createTable('memberships'))
    .addColumn('tenant_id', 'uuid', (c) => c.notNull().references('tenants.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('role', 'text', (c) => c.notNull().check(sql`role in ('owner', 'admin', 'member')`))
    .addUniqueConstraint('memberships_tenant_user', ['tenant_id', 'user_id'])
    .execute()
  await db.schema.createIndex('memberships_user_id').on('memberships').column('user_id').execute()
  await enableTenantRls(db, 'memberships')

  await withBaseColumns(db.schema.createTable('invitations'))
    .addColumn('tenant_id', 'uuid', (c) => c.notNull().references('tenants.id').onDelete('cascade'))
    .addColumn('email', 'text', (c) => c.notNull())
    .addColumn('role', 'text', (c) => c.notNull().check(sql`role in ('admin', 'member')`))
    .addColumn('token', 'text', (c) => c.notNull().unique())
    .addColumn('invited_by', 'uuid', (c) => c.references('users.id').onDelete('set null'))
    .addColumn('expires_at', 'timestamptz', (c) => c.notNull())
    .addColumn('accepted_at', 'timestamptz')
    .execute()
  await enableTenantRls(db, 'invitations')

  // ── Billing (Model 1: tenants pay the platform) ────────────────────
  await withBaseColumns(db.schema.createTable('plans'))
    .addColumn('code', 'text', (c) => c.notNull().unique())
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('price', 'integer', (c) => c.notNull()) // smallest currency unit
    .addColumn('currency', 'text', (c) => c.notNull().defaultTo('IDR'))
    .addColumn('interval', 'text', (c) => c.notNull().check(sql`interval in ('month', 'year')`))
    .addColumn('is_active', 'boolean', (c) => c.notNull().defaultTo(true))
    .execute()

  await db.schema
    .createTable('plan_entitlements')
    .addColumn('plan_id', 'uuid', (c) => c.notNull().references('plans.id').onDelete('cascade'))
    .addColumn('key', 'text', (c) => c.notNull())
    .addColumn('value', 'jsonb', (c) => c.notNull())
    .addPrimaryKeyConstraint('plan_entitlements_pk', ['plan_id', 'key'])
    .execute()

  await withBaseColumns(db.schema.createTable('subscriptions'))
    .addColumn('tenant_id', 'uuid', (c) =>
      c.notNull().unique().references('tenants.id').onDelete('cascade'),
    )
    .addColumn('plan_id', 'uuid', (c) => c.notNull().references('plans.id'))
    .addColumn('status', 'text', (c) =>
      c.notNull().check(sql`status in ('trialing', 'active', 'past_due', 'suspended', 'canceled')`),
    )
    .addColumn('current_period_end', 'timestamptz', (c) => c.notNull())
    .execute()
  await enableTenantRls(db, 'subscriptions')

  await withBaseColumns(db.schema.createTable('invoices'))
    .addColumn('tenant_id', 'uuid', (c) => c.notNull().references('tenants.id').onDelete('cascade'))
    .addColumn('subscription_id', 'uuid', (c) => c.references('subscriptions.id'))
    .addColumn('amount', 'integer', (c) => c.notNull())
    .addColumn('currency', 'text', (c) => c.notNull().defaultTo('IDR'))
    .addColumn('status', 'text', (c) => c.notNull().check(sql`status in ('open', 'paid', 'void')`))
    .addColumn('due_at', 'timestamptz', (c) => c.notNull())
    .addColumn('paid_at', 'timestamptz')
    .addColumn('gateway', 'text')
    .addColumn('gateway_ref', 'text')
    .execute()
  await enableTenantRls(db, 'invoices')

  // Webhook idempotency: the same event is processed once, however often it arrives.
  await withBaseColumns(db.schema.createTable('payment_events'))
    .addColumn('gateway', 'text', (c) => c.notNull())
    .addColumn('event_id', 'text', (c) => c.notNull())
    .addColumn('payload', 'jsonb', (c) => c.notNull())
    .addColumn('processed_at', 'timestamptz')
    .addUniqueConstraint('payment_events_gateway_event', ['gateway', 'event_id'])
    .execute()

  // ── Platform ───────────────────────────────────────────────────────
  await withBaseColumns(db.schema.createTable('files'))
    .addColumn('tenant_id', 'uuid', (c) => c.notNull().references('tenants.id').onDelete('cascade'))
    .addColumn('key', 'text', (c) => c.notNull().unique())
    .addColumn('filename', 'text', (c) => c.notNull())
    .addColumn('content_type', 'text', (c) => c.notNull())
    .addColumn('size', 'integer', (c) => c.notNull())
    .addColumn('status', 'text', (c) => c.notNull().check(sql`status in ('pending', 'ready')`))
    .addColumn('uploaded_by', 'uuid', (c) => c.references('users.id').onDelete('set null'))
    .execute()
  await enableTenantRls(db, 'files')

  await withBaseColumns(db.schema.createTable('audit_events'))
    .addColumn('tenant_id', 'uuid', (c) => c.notNull().references('tenants.id').onDelete('cascade'))
    .addColumn('actor_id', 'uuid', (c) => c.references('users.id').onDelete('set null'))
    .addColumn('action', 'text', (c) => c.notNull())
    .addColumn('target_type', 'text')
    .addColumn('target_id', 'text')
    .addColumn('metadata', 'jsonb', (c) => c.notNull().defaultTo(sql`'{}'::jsonb`))
    .execute()
  await db.schema
    .createIndex('audit_events_tenant_created')
    .on('audit_events')
    .columns(['tenant_id', 'created_at'])
    .execute()
  await enableTenantRls(db, 'audit_events')

  await withBaseColumns(db.schema.createTable('email_log'))
    .addColumn('tenant_id', 'uuid', (c) => c.references('tenants.id').onDelete('cascade'))
    .addColumn('template', 'text', (c) => c.notNull())
    .addColumn('recipient', 'text', (c) => c.notNull())
    .addColumn('status', 'text', (c) => c.notNull().check(sql`status in ('sent', 'failed')`))
    .addColumn('provider_id', 'text')
    .addColumn('error', 'text')
    .execute()
}

export async function down(db: MigrationDb): Promise<void> {
  for (const table of [
    'email_log',
    'audit_events',
    'files',
    'payment_events',
    'invoices',
    'subscriptions',
    'plan_entitlements',
    'plans',
    'invitations',
    'memberships',
    'auth_identities',
    'users',
    'tenants',
  ]) {
    await db.schema.dropTable(table).execute()
  }
}
