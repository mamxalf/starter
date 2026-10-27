#!/usr/bin/env node
// Dependency rules that Turborepo's tag boundaries cannot express. Fails with a list of violations.
//
//  1. An API module may not import another module's repo; go through that module's service.
//  2. Only apps/admin, apps/api/src/admin and packages/contracts may touch `@starter/contracts/admin`
//     (the platform-admin API contract). The tenant frontends must never see it.
//  3. apps/admin never imports `@starter/ui` (two UI systems, never mixed), nor `@starter/db` or
//     `@starter/platform` (frontends talk to the backend only through contracts).
//  4. apps/web and apps/site never import `@starter/db` or `@starter/platform`.
//  5. Nothing outside apps/admin imports from apps/admin (by package name or by relative path).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

const repoRoot = resolve('.')
const violations = []

const SOURCE = /\.(ts|tsx|mts|js|jsx|mjs|astro)$/
const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', '.astro', '.tanstack', 'paraglide'])

function* files(dir) {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) yield* files(path)
    else if (SOURCE.test(entry)) yield path
  }
}

/** Every module specifier a file imports: static, side-effect, dynamic, and require. */
function specifiers(source) {
  const found = []
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]/g,
  ]
  for (const pattern of patterns) for (const m of source.matchAll(pattern)) found.push(m[1])
  return found
}

const under = (file, dir) => {
  const rel = relative(repoRoot, resolve(file)).split(sep).join('/')
  return rel === dir || rel.startsWith(`${dir}/`)
}
const matches = (spec, prefix) => spec === prefix || spec.startsWith(`${prefix}/`)

// ── Rule 1: modules do not import each other's repo ────────────────────────
const modulesRoot = 'apps/api/src/modules'
for (const file of files(modulesRoot)) {
  const owner = relative(modulesRoot, file).split(sep)[0]
  for (const spec of specifiers(readFileSync(file, 'utf8'))) {
    const repo = spec.match(/(?:modules\/|\.\.\/)([\w-]+)\/[\w-]+\.repo$/)
    if (repo && repo[1] !== owner) {
      violations.push(`${file}: imports ${spec} (use the ${repo[1]} service instead)`)
    }
  }
}

// ── Rules 2-5: who may import what ─────────────────────────────────────────
const ADMIN_CONTRACT_ALLOWED = ['apps/admin', 'apps/api/src/admin', 'packages/contracts']
const SERVER_ONLY = ['@starter/db', '@starter/platform']

const checks = [
  {
    applies: (file) => !ADMIN_CONTRACT_ALLOWED.some((dir) => under(file, dir)),
    forbidden: (spec) => matches(spec, '@starter/contracts/admin'),
    message:
      'imports the admin contract; only apps/admin, apps/api/src/admin and packages/contracts may',
  },
  {
    applies: (file) => under(file, 'apps/admin'),
    forbidden: (spec) => matches(spec, '@starter/ui'),
    message: 'apps/admin must not import @starter/ui (it uses shadcn/ui)',
  },
  {
    applies: (file) => under(file, 'apps/admin'),
    forbidden: (spec) => SERVER_ONLY.some((pkg) => matches(spec, pkg)),
    message: 'apps/admin is a frontend: talk to the API through @starter/contracts/admin',
  },
  {
    applies: (file) => under(file, 'apps/web') || under(file, 'apps/site'),
    forbidden: (spec) => SERVER_ONLY.some((pkg) => matches(spec, pkg)),
    message: 'frontends talk to the backend only through @starter/contracts',
  },
  {
    applies: (file) => !under(file, 'apps/admin'),
    forbidden: (spec, file) =>
      matches(spec, '@starter/admin') ||
      (spec.startsWith('.') && under(resolve(file, '..', spec), 'apps/admin')),
    message: 'imports from apps/admin; nothing outside it may depend on the admin app',
  },
]

for (const root of ['apps', 'packages']) {
  for (const app of readdirSync(root)) {
    for (const file of files(join(root, app))) {
      const rules = checks.filter((check) => check.applies(file))
      if (rules.length === 0) continue
      for (const spec of specifiers(readFileSync(file, 'utf8'))) {
        for (const rule of rules) {
          if (rule.forbidden(spec, file)) violations.push(`${file}: ${spec} ${rule.message}`)
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error(`Module boundary violations:\n${violations.map((v) => `  - ${v}`).join('\n')}`)
  process.exit(1)
}
console.log('Module boundaries OK')
