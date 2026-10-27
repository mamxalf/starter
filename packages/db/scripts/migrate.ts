import { type Kysely, sql } from 'kysely'
import { createDb } from '../src/client'
import { createMigrator } from '../src/migrator'
import { databaseUrl } from './env'

const command = process.argv[2] ?? 'latest'
const db = createDb(databaseUrl(), { max: 1 }) as unknown as Kysely<unknown>
const migrator = createMigrator(db)

try {
  if (command === 'reset') {
    if (process.env.NODE_ENV === 'production') throw new Error('Refusing to reset in production')
    await sql`drop schema public cascade`.execute(db)
    await sql`create schema public`.execute(db)
    console.log('Schema dropped')
  }

  const result =
    command === 'down' ? await migrator.migrateDown() : await migrator.migrateToLatest()

  for (const r of result.results ?? []) {
    const mark = r.status === 'Success' ? '✓' : '✗'
    console.log(`${mark} ${r.direction.toLowerCase()} ${r.migrationName}`)
  }
  if (result.error) throw result.error
  if (!result.results?.length) console.log('Nothing to migrate')
} finally {
  await db.destroy()
}
