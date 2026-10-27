import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const name = process.argv[2]
if (!name || !/^[a-z][a-z0-9_]*$/.test(name)) {
  console.error('Usage: pnpm db:new <snake_case_name>')
  process.exit(1)
}

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
const id = `${stamp}_${name}`
const dir = resolve(import.meta.dirname, '../src/migrations')

writeFileSync(
  resolve(dir, `${id}.ts`),
  `import type { MigrationDb } from './_helpers'

export async function up(db: MigrationDb): Promise<void> {
  // await db.schema.alterTable('projects').addColumn('archived_at', 'timestamptz').execute()
}

export async function down(db: MigrationDb): Promise<void> {
  // await db.schema.alterTable('projects').dropColumn('archived_at').execute()
}
`,
)

const indexPath = resolve(dir, 'index.ts')
const index = readFileSync(indexPath, 'utf8')
  .replace(
    '// [gen:migration-imports]',
    `import * as m${stamp} from './${id}'\n// [gen:migration-imports]`,
  )
  .replace('  // [gen:migrations]', `  '${id}': m${stamp},\n  // [gen:migrations]`)
writeFileSync(indexPath, index)

console.log(`Created src/migrations/${id}.ts and registered it`)
