import { sql } from 'kysely'
import { createDb, type Database } from './client'
import { migrateToLatest } from './migrator'
import { seedPlans } from './seed'

/**
 * Fresh, fully migrated and seeded database for integration tests.
 * Points at TEST_DATABASE_URL (never DATABASE_URL) and wipes it first.
 */
export async function createTestDb(): Promise<Database> {
  const url = process.env.TEST_DATABASE_URL
  if (!url) throw new Error('TEST_DATABASE_URL is not set')
  const db = createDb(url, { max: 5 })
  await sql`drop schema public cascade`.execute(db)
  await sql`create schema public`.execute(db)
  await migrateToLatest(db as never)
  await seedPlans(db)
  return db
}
