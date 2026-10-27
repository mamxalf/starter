import type { PlopTypes } from '@turbo/gen'

/**
 * `pnpm gen module` — scaffolds a tenant-scoped CRUD module the Rails way:
 *   contract + migration (with RLS) + router/service/repo + tests (incl. tenant isolation),
 *   and registers it in the contract index, the API router and the migration index.
 * Then: `pnpm db:migrate` (applies + regenerates DB types) and fill in the fields.
 */
export default function generator(plop: PlopTypes.NodePlopAPI): void {
  const stamp = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)

  plop.setGenerator('module', {
    description: 'Tenant-scoped CRUD module (contract, migration, API, tests)',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'Module name, plural, kebab-case (e.g. "invoices", "time-entries"):',
        validate: (v: string) => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(v) || 'kebab-case please',
      },
      {
        type: 'input',
        name: 'singular',
        message: 'Singular, PascalCase (e.g. "Invoice", "TimeEntry"):',
        validate: (v: string) => /^[A-Z][A-Za-z0-9]*$/.test(v) || 'PascalCase please',
      },
    ],
    actions: (answers) => {
      const id = `${stamp()}_${plop.getHelper('snakeCase')(answers?.name)}`
      const data = { migrationId: id, migrationStamp: id.slice(0, 14) }
      const api = 'apps/api/src'
      return [
        // Contract
        {
          type: 'add',
          path: 'packages/contracts/src/modules/{{kebabCase name}}.ts',
          templateFile: 'templates/module/contract.ts.hbs',
        },
        {
          type: 'modify',
          path: 'packages/contracts/src/index.ts',
          pattern: /\/\/ \[gen:contract-imports\]/,
          template:
            "import { {{camelCase name}}Contract } from './modules/{{kebabCase name}}'\n// [gen:contract-imports]",
        },
        {
          type: 'modify',
          path: 'packages/contracts/src/index.ts',
          pattern: /\/\/ \[gen:contracts\]/,
          template: '{{camelCase name}}: {{camelCase name}}Contract,\n  // [gen:contracts]',
        },
        {
          type: 'modify',
          path: 'packages/contracts/src/index.ts',
          pattern: /\/\/ \[gen:contract-exports\]/,
          template: "export * from './modules/{{kebabCase name}}'\n// [gen:contract-exports]",
        },
        // Migration
        {
          type: 'add',
          path: `packages/db/src/migrations/${id}.ts`,
          templateFile: 'templates/module/migration.ts.hbs',
        },
        {
          type: 'modify',
          path: 'packages/db/src/migrations/index.ts',
          pattern: /\/\/ \[gen:migration-imports\]/,
          template: `import * as m${data.migrationStamp} from './${id}'\n// [gen:migration-imports]`,
        },
        {
          type: 'modify',
          path: 'packages/db/src/migrations/index.ts',
          pattern: / {2}\/\/ \[gen:migrations\]/,
          template: `  '${id}': m${data.migrationStamp},\n  // [gen:migrations]`,
        },
        // API module
        ...['router', 'service', 'repo', 'test'].map((part) => ({
          type: 'add' as const,
          path: `${api}/modules/{{kebabCase name}}/{{kebabCase name}}.${part}.ts`,
          templateFile: `templates/module/${part}.ts.hbs`,
        })),
        {
          type: 'modify',
          path: `${api}/router.ts`,
          pattern: /\/\/ \[gen:router-imports\]/,
          template:
            "import { {{camelCase name}}Router } from './modules/{{kebabCase name}}/{{kebabCase name}}.router'\n// [gen:router-imports]",
        },
        {
          type: 'modify',
          path: `${api}/router.ts`,
          pattern: /\/\/ \[gen:router\]/,
          template: '{{camelCase name}}: {{camelCase name}}Router,\n  // [gen:router]',
        },
        () =>
          [
            'Next steps:',
            '  1. pnpm db:migrate            (applies the migration, regenerates DB types)',
            '  2. add your fields: migration → contract → repo/service',
            '  3. pnpm format && pnpm turbo run typecheck test --filter=@starter/api',
          ].join('\n'),
      ]
    },
  })
}
