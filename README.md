# ts-saas-starter

Starter monorepo TypeScript ala Rails untuk SaaS multi-tenant: lengkap, tapi setiap bagian bisa dibongkar pasang.

- **Arsitektur:** [docs/architecture.id.md](docs/architecture.id.md) · [English](docs/architecture.en.md)
- **Konteks untuk coding agent:** [AGENTS.md](AGENTS.md)

|           |                                                                                              |
| --------- | -------------------------------------------------------------------------------------------- |
| Landing   | Astro statis, i18n, SEO (canonical, hreflang, sitemap, JSON-LD)                              |
| Dashboard | Vite + React + TanStack Router/Query/Form, tema bisa diganti (minimal, brutal, glass, voxel) |
| API       | Fastify + oRPC, modul per fitur, Postgres + Kysely, RLS per tenant                           |
| Auth      | Clerk di balik `AuthPort` (mode dev tanpa akun Clerk tersedia)                               |
| Platform  | Email (React Email), upload presigned S3, jobs pg-boss, billing langganan                    |
| Kualitas  | Biome, Vitest, Lefthook (pre-commit, pre-push), CI GitHub Actions                            |
| Deploy    | Satu image Docker + Kamal di satu VPS                                                        |

## Mulai

Butuh Node 22+, pnpm 12, dan Docker.

```bash
pnpm install
cp .env.example .env
docker compose up -d          # Postgres, Mailpit, storage S3 lokal (MinIO)
pnpm db:migrate && pnpm db:seed
pnpm dev
```

- Dashboard: http://localhost:5173 (login dengan email apa pun di mode dev)
- Landing: http://localhost:4321
- Email yang terkirim: http://localhost:8025
- Konsol storage dev: http://localhost:9001 (minio / minio12345); bucket `app` dibuat otomatis oleh API saat `pnpm dev` (`ensureBucket()`, hanya di development)

Beralih ke Clerk: isi `CLERK_*` dan `VITE_CLERK_PUBLISHABLE_KEY` di `.env`, lalu ubah `AUTH_PROVIDER=clerk` dan `VITE_AUTH_PROVIDER=clerk`.

## Perintah harian

```bash
pnpm gen module               # scaffold modul CRUD per tenant (kontrak, migrasi, API, test)
pnpm db:new <nama>            # migrasi baru
pnpm db:migrate               # jalankan migrasi + regenerasi tipe DB
pnpm turbo run typecheck test # semua pemeriksaan
pnpm format                   # Biome
```

## Deploy

1. Landing: `pnpm --filter @starter/site build` dengan `SITE_URL`, `PUBLIC_APP_URL`, `DEPLOY_ENV=production`, lalu unggah `apps/site/dist` ke CDN.
2. App: isi `config/deploy.yml` dan `.kamal/secrets` (contoh di `.kamal/secrets.example`), lalu `kamal setup` sekali dan `kamal deploy` setiap rilis.
