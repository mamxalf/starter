import { createDb } from '../src/client'
import { seedPlans } from '../src/seed'
import { databaseUrl } from './env'

const db = createDb(databaseUrl(), { max: 1 })
try {
  await seedPlans(db)
  console.log('Seeded plans: free, pro')
} finally {
  await db.destroy()
}
