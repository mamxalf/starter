#!/usr/bin/env node
// Enforces: an API module may not import another module's repo directly.
// Cross-module access must go through that module's service.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = 'apps/api/src/modules'
const violations = []

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path)
    else if (/\.(ts|tsx)$/.test(entry)) check(path)
  }
}

function check(file) {
  const owner = relative(root, file).split('/')[0]
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const spec = match[1]
    const repo = spec.match(/(?:modules\/|\.\.\/)([\w-]+)\/[\w-]+\.repo$/)
    if (repo && repo[1] !== owner) {
      violations.push(`${file}: imports ${spec} (use the ${repo[1]} service instead)`)
    }
  }
}

walk(root)
if (violations.length > 0) {
  console.error(`Module boundary violations:\n${violations.map((v) => `  - ${v}`).join('\n')}`)
  process.exit(1)
}
console.log('Module boundaries OK')
