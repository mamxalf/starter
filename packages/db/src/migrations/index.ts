import type { Migration } from 'kysely/migration'
import * as m20261027000100 from './20261027000100_core'
import * as m20261027000200 from './20261027000200_projects'
// [gen:migration-imports]

// Registered in order. `pnpm db:new <name>` appends new entries below the marker.
export const migrations: Record<string, Migration> = {
  '20261027000100_core': m20261027000100,
  '20261027000200_projects': m20261027000200,
  // [gen:migrations]
}
