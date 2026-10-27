import { createDb, migrateToLatest, seedPlans } from '@starter/db'
import { loadEnv } from './env'

/** Production migration entry (bundled to dist/migrate.js). Runs before traffic switches. */
const env = loadEnv()
const db = createDb(env.DATABASE_URL, { max: 1 })
try {
  const result = await migrateToLatest(db as never)
  for (const r of result.results ?? []) console.log(`${r.status} ${r.migrationName}`)
  await seedPlans(db)
} finally {
  await db.destroy()
}
