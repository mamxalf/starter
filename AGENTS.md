# AGENTS.md

Context for coding agents (Claude Code, Codex, Cursor, etc.) working in this repo.
Read this first, then `docs/architecture.en.md` for the reasoning behind each choice.

## What this is

A Rails-like TypeScript monorepo starter for multi-tenant SaaS, maintained by a solo founder.
Priorities, in order: correctness of tenant isolation, simplicity, swappable vendors, low resource use.
The user communicates mostly in Bahasa Indonesia; code, comments and commit messages are in English.

## Map

| Path                   | What lives there                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `apps/api`             | Fastify + oRPC API. `src/modules/<name>/` = router, service, repo, test                        |
| `apps/api/src/core`    | Cross-cutting: `users` (identity resolution), `policy`, `audit`, `billing`, `errors`           |
| `apps/api/src/orpc.ts` | Middleware chain: `authed` → `tenantRead` → `tenantWrite`                                      |
| `apps/api/src/deps.ts` | The only place adapters are chosen (auth, mail, storage, queue)                                |
| `apps/api/src/jobs`    | `definitions.ts` (name + schema), `handlers.ts` (worker side)                                  |
| `apps/web`             | Vite SPA dashboard. TanStack Router file routes in `src/routes`                                |
| `apps/site`            | Astro static landing page (SEO, i18n). No server code                                          |
| `packages/contracts`   | oRPC contract + Zod schemas. Source of truth for the API surface                               |
| `packages/db`          | Kysely client, migrations, generated `types.ts`, `withTenant`/`withSystem`                     |
| `packages/auth`        | `AuthPort`, adapters (`clerk`, `fake`), React wrappers (`/react`), contract tests (`/testing`) |
| `packages/platform`    | Ports: `context`, `logger`, `mail`, `storage`, `payment`, `jobs`                               |
| `packages/ui`          | Components + theme CSS (`src/styles/themes/*.css`)                                             |
| `packages/i18n`        | `messages/{id,en}.json` compiled by Paraglide into `src/paraglide` (gitignored)                |
| `turbo/generators`     | `pnpm gen module` templates                                                                    |

## Commands

```bash
pnpm install
docker compose up -d                 # postgres, mailpit (:8025), S3-compatible storage
cp .env.example .env
pnpm db:migrate && pnpm db:seed
pnpm dev                             # api :3000, web :5173, site :4321

pnpm turbo run typecheck test        # everything
pnpm --filter @starter/api test      # one package
pnpm lint / pnpm format              # Biome
pnpm check:boundaries                # dependency rules
pnpm db:new add_archived_at          # new migration (then edit it)
pnpm db:migrate                      # apply + regenerate packages/db/src/types.ts
pnpm gen module                      # scaffold a tenant-scoped CRUD module
```

API tests need Postgres at `TEST_DATABASE_URL` (a non-superuser role, see `docker/postgres/init.sql`).

## Non-negotiable rules

1. **Tenant data is only touched inside `scope.tx(...)` (or `withTenant`).** Every repo query also filters `tenant_id`. Never rely on RLS alone, never skip it.
2. **`withSystem` bypasses RLS.** Use it only for trusted cross-tenant work (memberships of a user, webhooks, billing/cleanup jobs, seeds). Never with request input as the tenant selector.
3. **Mutations use `tenantWrite`, reads use `tenantRead`.** `tenantWrite` enforces read-only mode for suspended subscriptions.
4. **Authorization goes through `core/policy.ts`** (`authorize(policy.x(scope.role))`). No inline role comparisons in services.
5. **Never use a provider's user id as a foreign key.** Our `users.id` is the identity; providers map in via `auth_identities`.
6. **Business code imports ports, not vendor SDKs.** `@clerk/*`, `@aws-sdk/*`, `nodemailer`, `pg-boss` appear only in adapters (`packages/auth/src/adapters`, `packages/platform/src/*`) and `@clerk/react` only in `packages/auth/src/react`.
7. **Frontends talk to the backend only through `packages/contracts`.** `apps/web` and `apps/site` must not import `@starter/db` or `@starter/platform`.
8. **A module never imports another module's repo.** Call its service.
9. **Never edit generated files:** `packages/db/src/types.ts` (run `pnpm db:migrate`), `apps/web/src/routeTree.gen.ts` (router plugin), `packages/i18n/src/paraglide/*` (Paraglide).
10. **Migrations are append-only once merged.** Fix forward with a new migration. Register new ones in `src/migrations/index.ts` (`pnpm db:new` does this).
11. **User-facing strings go through i18n** (`m.key()`), in both `id.json` and `en.json`. Server code passes the locale explicitly.
12. **Send email only via the `email.send` job**, never `mailer.send` from a request.

## How to add a feature module

1. `pnpm gen module` → answers e.g. `invoices` / `Invoice`. This creates the contract, a migration with RLS, router/service/repo, and tests including tenant isolation, and registers all of them.
2. Add columns in the generated migration, then `pnpm db:migrate`.
3. Extend the contract schemas, then repo → service → router. Keep row → API mapping in the service (`toX`).
4. Add policy rules in `core/policy.ts` if roles matter; call `recordAudit` for meaningful changes.
5. Add a route in `apps/web/src/routes/_app/$tenant/` using `orpc.<module>.<proc>.queryOptions` in the loader.
6. `pnpm format && pnpm turbo run typecheck test`.

`projects` is the reference module: copy its patterns.

## Conventions

- TypeScript strict, `noUncheckedIndexedAccess`. Imports without extensions (bundler resolution).
- Biome formats: 2 spaces, single quotes, no semicolons, 100 columns.
- Errors to clients: `throw new ORPCError('NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'BAD_REQUEST', { message })`. Unknown tenant and non-member are both `NOT_FOUND`.
- IDs: `newId()` (UUIDv7). Timestamps: `timestamptz`. Money: integer in the smallest unit + currency.
- Search/filter state in the dashboard lives in typed search params (`validateSearch`), not component state.
- UI components use semantic tokens only (`bg-surface`, `rounded-ui`, `border-ui`, `shadow-ui`); no raw colors.

## Testing

- API integration tests use `createTestDeps()` (`apps/api/src/test/helpers.ts`): real Postgres, fake auth, memory mailer/storage, inline job queue.
  - `kit.signUp('alice', 'alice@example.com')`, `kit.clientAs('alice', 'acme').projects.list(...)`
  - wrap calls in `kit.inRequest(() => ...)` so request context exists.
  - Reading tenant tables directly in a test needs `withTenant` or `withSystem` (RLS hides rows otherwise).
- Every new module keeps its tenant-isolation tests.
- New adapters must pass the port's contract suite (e.g. `describeAuthPortContract`).

## Gotchas (versions current as of 2026-10)

- **Kysely 0.29:** `Migrator` and `Migration` come from `kysely/migration`, not `kysely`.
- **pnpm 12:** packages with install scripts must be listed under `allowBuilds` in `pnpm-workspace.yaml`.
- **TypeScript 7 (native):** `tsc` is fast; `baseUrl` and legacy module resolution are gone. Astro templates are not type-checked by `tsc` (only `.ts` files are).
- **Paraglide output is generated.** Turborepo builds `@starter/i18n` before dependents; after editing messages outside Turbo run `pnpm --filter @starter/i18n build`.
- **RLS + superuser:** if tests unexpectedly see other tenants' rows, the connection is a superuser. Use the `app` role.
- **Dev auth:** `AUTH_PROVIDER=fake` + `VITE_AUTH_PROVIDER=dev` signs in with any email. Refused in production.
- **TanStack Router:** search params with `.default()` are optional for links; `routeTree.gen.ts` is regenerated by `tsr generate` (part of `typecheck`) or the Vite plugin.

## Definition of done

- `pnpm lint`, `pnpm check:boundaries` and `pnpm turbo run typecheck test` pass.
- New user-facing strings exist in both locales.
- Schema changes come with a migration and regenerated `types.ts`.
- `docs/architecture.id.md` and `docs/architecture.en.md` updated together when a decision changes.
