import type { Kysely } from 'kysely'
import { type MigrationResultSet, Migrator } from 'kysely/migration'
import { migrations } from './migrations'

/**
 * Migrations are registered statically in ./migrations/index.ts (not read from disk),
 * so the same code works in dev (tsx) and in the bundled production image.
 */
export function createMigrator(db: Kysely<unknown>): Migrator {
  return new Migrator({
    db,
    provider: { getMigrations: async () => migrations },
  })
}

export async function migrateToLatest(db: Kysely<unknown>): Promise<MigrationResultSet> {
  const result = await createMigrator(db).migrateToLatest()
  if (result.error) throw result.error
  return result
}
