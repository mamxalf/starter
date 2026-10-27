# Architecture

> Indonesian version: [architecture.id.md](./architecture.id.md). Keep both documents in sync.

This starter is a personal foundation for building multi-tenant SaaS products in TypeScript: as complete as Rails, but with every part swappable. It is used by one person (a solo founder), so operational simplicity beats scale.

## 1. Principles

1. **Conventions + generators, not a framework.** The Rails feel comes from a consistent structure and `pnpm gen module`, not from one big framework.
2. **Abstract only where a vendor sits.** Auth, email, storage, payments and the job queue are behind ports. The query builder, router and validator are not wrapped.
3. **Own the core data.** Users, tenants, memberships and billing live in our database, not at a vendor.
4. **One Postgres for everything.** Data, job queue and cron in one database. No Redis.
5. **YAGNI.** What is not needed yet is merely not blocked; it is not built.

## 2. Decisions at a glance

| Area           | Decision                                                                      | Main reason                                                              |
| -------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Monorepo       | pnpm workspaces + Turborepo                                                   | Light, cached, `turbo gen` for scaffolding                               |
| Runtime        | Node 22+                                                                      | LTS, stable                                                              |
| Landing        | Static Astro + i18n, on a CDN                                                 | Best SEO, zero JS by default, free hosting                               |
| Dashboard      | Vite SPA + TanStack Router/Query/Form                                         | Type-safe, search params as state, no server                             |
| UI             | Tailwind v4 + owned components + tailwind-variants                            | Components we own, themes via tokens                                     |
| API            | Fastify + oRPC                                                                | Type-safe contract, framework-agnostic                                   |
| Validation     | Zod                                                                           | One schema for API and forms                                             |
| Database       | PostgreSQL + Kysely                                                           | DB is the source of truth, types are generated                           |
| Tenancy        | `tenant_id` + RLS, path-based URLs                                            | One migration, two layers of isolation                                   |
| Auth           | Clerk behind `AuthPort`                                                       | Identity from a vendor, memberships owned by us                          |
| Authorization  | Role per membership + policy functions                                        | Simple, easy to test                                                     |
| i18n           | Paraglide JS in `packages/i18n`                                               | Type-safe, used by Astro, Vite and emails                                |
| Billing        | Model 1: plans, entitlements, invoices via jobs                               | Fits one-off payment methods common in Indonesia                         |
| Uploads        | Presigned URLs to S3-compatible storage                                       | Files never pass through the server                                      |
| Email          | React Email + `Mailer` port, sent via jobs                                    | Automatic retries, multilingual templates                                |
| Jobs           | pg-boss                                                                       | No Redis                                                                 |
| Observability  | pino + Sentry SDK + audit log                                                 | Minimal but sufficient                                                   |
| Quality        | Biome, Vitest, Lefthook                                                       | Fast, one tool per job                                                   |
| Deploy         | One image + worker + Postgres via Kamal                                       | Zero-downtime on one VPS                                                 |
| Platform admin | Separate app, contract, API mount, host and audit; allowlist + verified email | The only code that crosses tenants is isolated                           |
| Admin UI       | shadcn/ui in `apps/admin`; `@starter/ui` stays for the product                | Mature data tables and dialogs for an internal tool; themes for products |

## 3. Monorepo layout

```
apps/
  site/        Astro: landing, pricing (static, i18n) → CDN
  web/         Vite SPA: dashboard → served by api (same origin)
  admin/       Vite SPA + shadcn/ui: platform back-office → served by api on ADMIN_HOST
  api/         Fastify + oRPC. Entries: server.ts, worker.ts, migrate.ts (one image)
packages/
  contracts/   oRPC contract + Zod schemas. The only frontend ↔ backend boundary
  db/          Kysely, migrations, generated types, tenancy helpers (withTenant/withSystem)
  auth/        AuthPort + adapters (clerk, fake) + React wrappers
  ui/          Components + themes (minimal, brutal, glass, voxel)
  i18n/        Paraglide messages (id, en)
  platform/    Ports: mail, storage, payment, jobs, logger, request context
  config/      tsconfig presets
turbo/generators/   pnpm gen module
```

Dependency rules (checked by `pnpm check:boundaries` on pre-push and in CI):

- `packages/*` must not import `apps/*` (Turborepo tag `lib` ↛ `app`).
- `apps/web` and `apps/site` must not depend on `db` or `platform` (tag `frontend` ↛ `server-only`).
- `apps/admin` must not import `@starter/ui`; only `apps/admin`, `apps/api/src/admin` and `packages/contracts` may import `@starter/contracts/admin`; nothing outside `apps/admin` may import from it (`scripts/check-module-boundaries.mjs`).
- An API module must not import another module's `*.repo.ts`; it goes through that module's service (`scripts/check-module-boundaries.mjs`).
- Business code never imports vendor SDKs directly; only ports.

## 4. Frontend

### Landing (`apps/site`)

- Fully static Astro, no adapter. Deploy `dist/` to a CDN.
- i18n routing: `/id/...`, `/en/...`; `/` redirects to `/id/`.
- `Base.astro` sets canonical, `hreflang` + `x-default`, Open Graph and JSON-LD (`src/lib/seo.ts`).
- Per-locale sitemap (`@astrojs/sitemap`). `robots.txt` allows indexing only when `DEPLOY_ENV=production`.
- Build variables: `SITE_URL`, `PUBLIC_APP_URL`, `DEPLOY_ENV`.

### Dashboard (`apps/web`)

- Vite SPA. In dev, Vite proxies `/api` to the API; in production the API serves the SPA. Always same-origin, so no CORS.
- **TanStack Router:** file-based (`src/routes`), automatic code splitting, Zod-validated search params, guards in `beforeLoad`.
- **TanStack Query:** through `orpc` (`src/lib/api.ts`), with data preloaded by route loaders.
- **TanStack Form:** wrapped by the `<Field>` component from `@starter/ui`.
- Route tree: `_app` (signed in) → `_app/$tenant` (member; the slug is sent as the `x-tenant-slug` header) → feature pages.
- Switching tenants drops tenant-scoped query cache, because keys are the same across tenants.

### UI and themes (`packages/ui`)

Themes differ in **shape**, not just color. Each theme is one CSS file in `src/styles/themes/` that sets the tokens: colors, `--radius`, `--border-w`, `--shadow`, `--shadow-press`, `--blur`, `--font-body`, `--font-heading`.

- Components only use semantic utilities: `bg-surface`, `rounded-ui`, `border-ui`, `shadow-ui`, `backdrop-blur-ui`, `font-display`.
- New theme: add a CSS file and register it in `THEMES` (`src/lib/theme.ts`). A test checks every theme defines every token.
- The active theme is chosen by `data-theme` (and `data-mode="dark"`) on `<html>`.

## 5. Backend

The API is split by feature. Each module lives in `apps/api/src/modules/<name>/`:

| File                | Contents                                                            |
| ------------------- | ------------------------------------------------------------------- |
| `<name>.router.ts`  | Implements the contract; picks `tenantRead` or `tenantWrite`        |
| `<name>.service.ts` | Business logic, authorization, audit. Plain functions               |
| `<name>.repo.ts`    | Kysely queries, always filtered by `tenant_id`                      |
| `<name>.test.ts`    | Integration tests against real Postgres, including tenant isolation |

No DI container. `Deps` (db, auth, mailer, storage, queue) are wired once in `deps.ts` and travel through the oRPC context, so tests swap in in-memory versions.

Middleware chain (`src/orpc.ts`):

1. `authed`: `AuthPort.authenticate` → `resolveUser` (creates or links our user).
2. `tenantRead`: reads `x-tenant-slug`, checks membership, provides `context.tx()` (an RLS-scoped transaction) and `role`. Unknown tenant and non-member both answer `NOT_FOUND`.
3. `tenantWrite`: like `tenantRead`, but rejects mutations while the subscription is `suspended`.

`AsyncLocalStorage` (`@starter/platform/context`) holds `requestId`, `tenantId`, `userId`, `locale`; the logger, audit log and jobs read it automatically. The environment is validated with Zod at startup (`src/env.ts`).

## 6. Database and migrations

Postgres is the source of truth: migrations change the DB, then `kysely-codegen` generates `packages/db/src/types.ts`.

| Command              | What it does                                          |
| -------------------- | ----------------------------------------------------- |
| `pnpm db:new <name>` | Creates a timestamped migration file and registers it |
| `pnpm db:migrate`    | Runs migrations, then regenerates types               |
| `pnpm db:rollback`   | Reverts the last migration                            |
| `pnpm db:seed`       | Seeds plans (idempotent)                              |
| `pnpm db:reset`      | Drop, migrate, seed. Dev only                         |
- Migrations are registered statically in `src/migrations/index.ts`, so they are bundled into `dist/migrate.js` for production.
- UUIDv7 primary keys are generated in the app (`newId()`).
- Every tenant table uses `withBaseColumns` + `enableTenantRls`.
- Production migrations run in the web role's container entrypoint (`RUN_MIGRATIONS=true`) before the new container takes traffic.

## 7. Multi-tenancy and authorization

**Two layers of isolation:**

1. Repos always filter by `tenant_id`.
2. RLS: the `tenant_isolation` policy checks `app.tenant_id`. `withTenant(db, id, fn)` opens a transaction and sets it transaction-locally.

The app connects as a **non-superuser** role (`app`), because superusers always bypass RLS. Tables use `FORCE ROW LEVEL SECURITY` so the policy applies to the table owner too.

`withSystem(db, fn)` bypasses RLS for trusted cross-tenant work (a user's membership list, webhooks, billing jobs, seeds). Never call it with input taken straight from a request.

**Tenant identification:** path-based (`app.domain.com/{slug}/...`). The dashboard sends the slug as the `x-tenant-slug` header. Subdomains or custom domains can be added in one place (the `tenantRead` middleware).

**Authorization:** `owner > admin > member` per membership, plus policy functions in `src/core/policy.ts` (`policy.deleteProject(role)`). Clerk Organizations are deliberately not used.

**Members:** a tenant always has exactly one owner (partial unique index `memberships_one_owner`); ownership moves only through `members.transferOwnership`, which demotes the old owner to admin in the same transaction. The owner manages everyone; an admin manages plain members only, and only the owner can grant the admin role (by role change or invitation, and only the owner can resend or revoke an admin invitation); a member can only leave. The owner cannot leave without transferring. Accepting an invitation re-checks `max_members` against confirmed members.

## 8. Swappable auth

`AuthPort` (`packages/auth/src/port.ts`) answers one question: "which identity at which provider made this request?"

- Provider user ids are **never** foreign keys. The mapping lives in `auth_identities(provider, external_id, user_id)`.
- Users are created or linked on first sight (`resolveUser`), so nothing depends on webhooks.
- Linking to an existing user by email only happens when the provider reports the email as **verified**.
- The frontend uses `@starter/auth/react` (`AuthProvider`, `useClientAuth`, `SignInView`, `UserMenu`), never `@clerk/react` directly.
- Every adapter must pass `describeAuthPortContract` (`@starter/auth/testing`).

**Dev mode:** `AUTH_PROVIDER=fake` + `VITE_AUTH_PROVIDER=dev` lets you sign in with any email, no Clerk account needed. The API refuses to start in this mode in production.

**Moving to Better Auth:** write a new adapter, make it pass the contract tests, swap it in `deps.ts` and `packages/auth/src/react`. Existing identities link automatically by verified email. Business modules are untouched.

## 9. i18n

| Layer      | Approach                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------- |
| Messages   | `packages/i18n/messages/{id,en}.json`, compiled by Paraglide (`pnpm --filter @starter/i18n build`, run by Turborepo) |
| Landing    | Locale prefix in URLs, `hreflang`, per-locale sitemap                                                                |
| Dashboard  | `users.locale`, falling back to `tenants.default_locale`. No URL prefix                                              |
| Server     | Locale passed explicitly: `m.email_invite_subject(inputs, { locale })`                                               |
| Formatting | `Intl` for dates, numbers, currency                                                                                  |

Multilingual tenant content is deferred. When needed: start with a JSONB column per field, move to `<entity>_translations` tables only for per-language full-text search.

## 10. Billing (Model 1)

Tenants pay the platform a subscription. The billing engine is ours (`apps/api/src/core/billing.ts`); the payment gateway is just an adapter (`PaymentGateway` in `@starter/platform/payment`), written when the first product needs it.

```
trialing → active ─(7 days before period end: invoice)─▶ paid → active (next period)
                                                      └▶ overdue → past_due
                                                         └▶ + 7-day grace → suspended (read-only)
```

- New tenants get a 14-day trial on the `pro` plan.
- The daily `billing.cycle` job issues invoices and advances statuses. Idempotent.
- `markInvoicePaid` is called by the webhook handler; duplicate webhooks are harmless. Per-event idempotency is stored in `payment_events`.
- Feature code checks entitlements (`entitlement(trx, tenantId, 'max_members')`), never plan names.
- `suspended` means read-only: data can still be read and exported.

## 11. Uploads, email and jobs

**Uploads:** `files.createUpload` creates a `pending` row + a presigned PUT URL (size and type are signed) → the browser uploads straight to storage → `files.completeUpload` verifies the object → `ready`. Key: `tenants/{tenantId}/{fileId}`. An hourly job deletes `pending` uploads older than 24 hours.

**Email:** React Email + Paraglide templates in `apps/api/src/emails`. Always sent through the `email.send` job (automatic retries), logged in `email_log`. Sender: `Tenant Name via App <noreply@...>` with `reply-to` set to the inviter. Dev uses Mailpit (`http://localhost:8025`).

**Jobs:** pg-boss in Postgres. Definitions (name + schema) in `jobs/definitions.ts`; handlers in `jobs/handlers.ts`. Payloads carrying `tenantId` run inside that tenant's context. The worker uses the same image: `node dist/worker.js`. In development, jobs run inside the API process so one process is enough.

## 12. Observability and audit

| Need           | Implementation                                                         |
| -------------- | ---------------------------------------------------------------------- |
| Logs           | pino JSON to stdout with `requestId`, `tenantId`, `userId`             |
| Error tracking | Sentry SDK when `SENTRY_DSN` is set (works with self-hosted GlitchTip) |
| Health         | `/healthz` (process up), `/readyz` (DB reachable; used by Kamal)       |
| Audit log      | `audit_events`, written from services via `recordAudit`                |
| Rate limit     | 300 requests/minute per IP; 10/minute per user on invites              |

Rate-limit counters are in-memory: fine for one VPS, but a shared store is needed if the API is scaled out.

## 13. Quality

| Stage                           | Contents                                                        |
| ------------------------------- | --------------------------------------------------------------- |
| pre-commit (Lefthook)           | Biome on staged files                                           |
| pre-push (Lefthook)             | Dependency boundaries + `turbo typecheck test --affected`       |
| CI (`.github/workflows/ci.yml`) | Lint, boundaries, typecheck, tests, build against real Postgres |

Testing strategy: unit tests for policies and utilities; API integration tests against real Postgres (`TEST_DATABASE_URL`) with fakes for every vendor; contract tests for adapters; a tenant-isolation test for every module.

## 14. Deploy

One 1–2 GB VPS is enough: one Docker image runs the API and serves the SPA, the worker uses the same image, and Postgres runs on the same server. The landing page lives on a CDN.

- Multi-stage `Dockerfile`: esbuild bundles the API into `dist/server.js`, `dist/worker.js`, `dist/migrate.js`; the runtime installs only packages that cannot be bundled.
- `config/deploy.yml` (Kamal 2): `web` and `worker` roles, a Postgres accessory, `/readyz` health check.
- Secrets in `.kamal/secrets` (gitignored; see `.kamal/secrets.example`).
- Postgres backups: `scripts/backup.sh` + cron, see [Backup and restore](#backup-and-restore).

### Backup and restore

`scripts/backup.sh` runs on the VPS host (it needs `docker` and the `aws` CLI, neither is in the app image). It dumps the database with `pg_dump -Fc` inside the Kamal Postgres accessory (`starter-db`), checks the dump with `pg_restore --list`, and uploads it to `BACKUP_S3_URI` as `<db>-<UTC timestamp>.dump`. Nothing is uploaded if the dump is empty or unreadable. The job queue lives in the same database, so it is covered too.

```bash
# /etc/starter-backup.env (chmod 600): BACKUP_S3_URI, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
15 2 * * *  . /etc/starter-backup.env && /opt/starter/backup.sh >> /var/log/starter-backup.log 2>&1
```

- Use a bucket separate from user uploads, and add a lifecycle rule (for example delete after 30 days). Retention is not the script's job.
- Uploaded files live in the object store and are **not** in this dump. Turn on versioning or replication on that bucket if you need them back.
- `DRY_RUN=1 scripts/backup.sh` prints what would run.

**Restore** (the app keeps serving from the old database until the swap):

```bash
# 1. Fetch the dump
aws --endpoint-url "$S3_ENDPOINT" s3 ls s3://my-backups/starter/
aws --endpoint-url "$S3_ENDPOINT" s3 cp s3://my-backups/starter/app-<timestamp>.dump /tmp/restore.dump

# 2. Restore into a NEW database. Do not use --no-owner: the app role must own the tables,
#    because FORCE ROW LEVEL SECURITY applies to the owner and `app` is not a superuser.
docker exec starter-db psql -U postgres -c "create database app_restore owner app"
docker exec -i starter-db pg_restore -U postgres -d app_restore --exit-on-error < /tmp/restore.dump

# 3. Check it: row counts and the number of applied migrations
docker exec starter-db psql -U postgres -d app_restore -c "select count(*) from tenants" -c "select count(*) from kysely_migration"

# 4. Swap (renaming needs zero open connections, so stop the app first)
kamal app stop
docker exec starter-db psql -U postgres -c "alter database app rename to app_old" -c "alter database app_restore rename to app"
kamal app boot
```

Keep `app_old` until the restored data is confirmed, then drop it. A backup you have never restored is a guess: restore the latest dump into a scratch database once a month and run the step 3 checks.


## 15. Platform admin

A back-office for the **platform owner**, not for tenant admins: see and manage every tenant (extend a trial, change a plan, suspend or restore a workspace), look up users, retry failed jobs, and read a platform audit log. Tenant-level features (members, billing and settings for one tenant) stay in `apps/web`.

It is the only code that deliberately crosses tenant boundaries (`withSystem`), so it is isolated at every layer:

| Layer      | Isolation                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| App        | `apps/admin`: its own Vite SPA and bundle (`pnpm --filter @starter/admin dev`, port 5174)              |
| Contract   | `@starter/contracts/admin`, never re-exported from `@starter/contracts`                                |
| API        | `apps/api/src/admin`, mounted at `/api/admin/rpc`; not under `src/modules`                             |
| Host       | In production the API answers it only on `ADMIN_HOST`; the same image serves both SPAs, chosen by Host |
| UI library | shadcn/ui source inside `apps/admin` (see below)                                                       |
| Audit      | `platform_audit_events`, separate from the tenant `audit_events`                                       |

**Access (every layer is required).**

1. **Identity:** the same `AuthPort` and `resolveUser` as the main API.
2. **Allowlist:** `PLATFORM_ADMINS` (comma-separated emails). Platform admins are not tenant memberships and no role is added to `memberships`. The email must be **verified** at the auth provider: `resolveUser` creates a user from an unverified email when nobody owns it yet, so without that check anyone could sign up as an allowlisted address. Non-admins get `NOT_FOUND` so the API does not reveal itself; an empty or unset list disables the admin API entirely.
3. **Host:** in production `/api/admin/rpc` answers only when the request host equals `ADMIN_HOST`; any other host gets 404.
4. **Optional network layer:** when `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` are set, the `Cf-Access-Jwt-Assertion` JWT is verified against the team's JWKS (issuer and audience checked, keys never hard-coded).

**Audit.** Every mutation requires a `reason` (at least 5 characters) and writes exactly one `platform_audit_events` row in the same transaction as the change. The rule itself is a function in `core/billing.ts` (`extendTrial`, `changePlan`, `setSuspended`); the admin service only calls it. For `jobs.retry` the audit row is written first inside the transaction that performs the retry, because the queue has its own connection: a retry never happens without its row, and a refused retry leaves none. The table has row level security that only `withSystem` passes, so a tenant transaction sees no rows even by mistake.

**Two UI systems, never mixed.** The product UI (`apps/web`, `apps/site`) uses `@starter/ui`: owned components with semantic tokens and swappable themes, because each product wants its own look. The admin is an internal, English-only tool that needs no theming but does need mature data tables, dialogs and a command palette, so it uses shadcn/ui, whose components are copied into `apps/admin/src/components/ui` and owned like any other source. `apps/admin` never imports `@starter/ui`, and shadcn components never move into `packages/ui` unchanged. `pnpm check:boundaries` enforces this, together with: only `apps/admin`, `apps/api/src/admin` and `packages/contracts` may import `@starter/contracts/admin`; nothing outside `apps/admin` may import from it.

**Out of scope:** impersonation ("log in as user"), deleting tenants, editing a tenant's business data, revenue and metrics dashboards, bulk actions, email broadcasts.

## 16. Deferred or not done

| Item                                         | Status   | Trigger                                         |
| -------------------------------------------- | -------- | ----------------------------------------------- |
| Model 2 (tenants charge their own customers) | Not done | A product genuinely needs it                    |
| Payment gateway adapter                      | Deferred | The first product that charges                  |
| Multilingual tenant content                  | Deferred | A tenant asks for it                            |
| Custom domain per tenant                     | Deferred | Sales feature; likely together with Better Auth |
| Automatic OG images (Satori)                 | Deferred | When the landing page is promoted               |
| Playwright E2E                               | Deferred | The first critical flow of a real product       |
| Dynamic RBAC                                 | Deferred | A tenant asks for custom roles                  |
| Tracing, log aggregation                     | Deferred | Cross-service debugging gets hard               |
| SSR dashboard                                | Deferred | Move to TanStack Start if needed                |
| Redis                                        | Not done | Postgres already handles queues and cron        |
