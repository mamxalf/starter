# Arsitektur

> Versi bahasa Inggris: [architecture.en.md](./architecture.en.md). Kedua dokumen harus selalu sinkron.

Starter ini adalah fondasi pribadi untuk membangun SaaS multi-tenant dengan TypeScript: lengkap seperti Rails, tetapi setiap bagian bisa dibongkar pasang. Dipakai satu orang (solo founder), jadi kesederhanaan operasional lebih penting daripada skala.

## 1. Prinsip

1. **Konvensi + generator, bukan framework.** Rasa Rails datang dari struktur yang konsisten dan `pnpm gen module`, bukan dari satu framework besar.
2. **Abstraksi hanya di tempat yang punya vendor.** Auth, email, storage, payment, dan job queue ada di balik port. Query builder, router, dan validator tidak dibungkus.
3. **Data inti milik sendiri.** User, tenant, membership, dan billing disimpan di DB sendiri, bukan di vendor.
4. **Satu Postgres untuk semuanya.** Data, antrean job, dan cron di satu database. Tanpa Redis.
5. **YAGNI.** Yang belum dibutuhkan cukup tidak dihalangi, tidak perlu dibangun.

## 2. Ringkasan keputusan

| Area           | Keputusan                                                                          | Alasan utama                                                        |
| -------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Monorepo       | pnpm workspaces + Turborepo                                                        | Ringan, caching, `turbo gen` untuk scaffolding                      |
| Runtime        | Node 22+                                                                           | LTS, stabil                                                         |
| Landing        | Astro statis + i18n, di CDN                                                        | SEO terbaik, nol JS default, hosting gratis                         |
| Dashboard      | Vite SPA + TanStack Router/Query/Form                                              | Type-safe, search params sebagai state, tanpa server                |
| UI             | Tailwind v4 + komponen sendiri + tailwind-variants                                 | Komponen milik sendiri, tema via token                              |
| API            | Fastify + oRPC                                                                     | Kontrak typesafe, tidak terikat framework                           |
| Validasi       | Zod                                                                                | Schema dipakai bersama API dan form                                 |
| Database       | PostgreSQL + Kysely                                                                | DB sebagai sumber kebenaran, tipe digenerate                        |
| Tenancy        | `tenant_id` + RLS, URL berbasis path                                               | Satu migrasi, isolasi dua lapis                                     |
| Auth           | Clerk di balik `AuthPort`                                                          | Identitas dari vendor, membership milik sendiri                     |
| Otorisasi      | Role per membership + fungsi policy                                                | Sederhana, mudah ditest                                             |
| i18n           | Paraglide JS di `packages/i18n`                                                    | Type-safe, dipakai di Astro, Vite, dan email                        |
| Billing        | Model 1: plan, entitlement, invoice via job                                        | Cocok untuk pembayaran sekali bayar di Indonesia                    |
| Upload         | Presigned URL ke storage S3-compatible                                             | File tidak lewat server                                             |
| Email          | React Email + `Mailer` port, kirim via job                                         | Retry otomatis, template multi-bahasa                               |
| Jobs           | pg-boss                                                                            | Tanpa Redis                                                         |
| Observability  | pino + Sentry SDK + audit log                                                      | Minimal tapi cukup                                                  |
| Kualitas       | Biome, Vitest, Lefthook                                                            | Cepat, satu tool per tugas                                          |
| Deploy         | Satu image + worker + Postgres via Kamal                                           | Zero-downtime di satu VPS                                           |
| Admin platform | App, kontrak, mount API, host, dan audit terpisah; allowlist + email terverifikasi | Satu-satunya kode lintas tenant terisolasi                          |
| UI admin       | shadcn/ui di `apps/admin`; `@starter/ui` tetap untuk produk                        | Tabel data dan dialog matang untuk alat internal; tema untuk produk |

## 3. Struktur monorepo

```
apps/
  site/        Astro: landing, pricing (statis, i18n) → CDN
  web/         Vite SPA: dashboard → disajikan oleh api (same-origin)
  admin/       Vite SPA + shadcn/ui: back-office platform → disajikan oleh api di ADMIN_HOST
  api/         Fastify + oRPC. Entry: server.ts, worker.ts, migrate.ts (satu image)
packages/
  contracts/   Kontrak oRPC + schema Zod. Satu-satunya batas frontend ↔ backend
  db/          Kysely, migrasi, tipe hasil generate, helper tenancy (withTenant/withSystem)
  auth/        AuthPort + adapter (clerk, fake) + pembungkus React
  ui/          Komponen + tema (minimal, brutal, glass, voxel)
  i18n/        Pesan Paraglide (id, en)
  platform/    Port: mail, storage, payment, jobs, logger, request context
  config/      Preset tsconfig
turbo/generators/   pnpm gen module
```

Aturan dependensi (diperiksa `pnpm check:boundaries` di pre-push dan CI):

- `packages/*` tidak boleh mengimpor `apps/*` (tag Turborepo `lib` ↛ `app`).
- `apps/web` dan `apps/site` tidak boleh bergantung pada `db` atau `platform` (tag `frontend` ↛ `server-only`).
- `apps/admin` tidak boleh mengimpor `@starter/ui`; hanya `apps/admin`, `apps/api/src/admin`, dan `packages/contracts` yang boleh mengimpor `@starter/contracts/admin`; tidak ada yang di luar `apps/admin` boleh mengimpor darinya (`scripts/check-module-boundaries.mjs`).
- Modul API tidak boleh mengimpor `*.repo.ts` milik modul lain; harus lewat service-nya (`scripts/check-module-boundaries.mjs`).
- Kode bisnis tidak mengimpor SDK vendor secara langsung; hanya lewat port.

## 4. Frontend

### Landing (`apps/site`)

- Astro statis penuh, tanpa adapter. `dist/` dideploy ke CDN.
- Routing i18n: `/id/...`, `/en/...`; `/` mengalihkan ke `/id/`.
- `Base.astro` mengisi canonical, `hreflang` + `x-default`, Open Graph, dan JSON-LD (`src/lib/seo.ts`).
- Sitemap per bahasa (`@astrojs/sitemap`). `robots.txt` hanya mengizinkan indexing bila `DEPLOY_ENV=production`.
- Variabel build: `SITE_URL`, `PUBLIC_APP_URL`, `DEPLOY_ENV`.

### Dashboard (`apps/web`)

- Vite SPA. Di dev, Vite mem-proxy `/api` ke API; di production, API menyajikan SPA. Selalu same-origin, jadi tanpa CORS.
- **TanStack Router:** file-based (`src/routes`), code splitting otomatis, search params divalidasi Zod, guard di `beforeLoad`.
- **TanStack Query:** lewat `orpc` (`src/lib/api.ts`), data di-preload oleh loader route.
- **TanStack Form:** dibungkus komponen `<Field>` dari `@starter/ui`.
- Struktur route: `_app` (wajib login) → `_app/$tenant` (wajib member; slug dikirim sebagai header `x-tenant-slug`) → halaman fitur.
- Saat pindah tenant, cache query milik tenant dihapus karena key-nya sama antar tenant.

### UI dan tema (`packages/ui`)

Tema dibedakan oleh **bentuk**, bukan hanya warna. Setiap tema adalah satu file CSS di `src/styles/themes/` yang mengisi token: warna, `--radius`, `--border-w`, `--shadow`, `--shadow-press`, `--blur`, `--font-body`, `--font-heading`.

- Komponen hanya memakai utilitas semantik: `bg-surface`, `rounded-ui`, `border-ui`, `shadow-ui`, `backdrop-blur-ui`, `font-display`.
- Tema baru: tambah file CSS + daftarkan di `THEMES` (`src/lib/theme.ts`). Test memastikan setiap tema punya semua token.
- Tema aktif dipilih lewat `data-theme` (dan `data-mode="dark"`) di `<html>`.

## 5. Backend

API dipecah per fitur. Setiap modul di `apps/api/src/modules/<nama>/`:

| File                | Isi                                                                  |
| ------------------- | -------------------------------------------------------------------- |
| `<nama>.router.ts`  | Mengimplementasikan kontrak; memilih `tenantRead` atau `tenantWrite` |
| `<nama>.service.ts` | Logika bisnis, otorisasi, audit. Fungsi biasa                        |
| `<nama>.repo.ts`    | Query Kysely, selalu memfilter `tenant_id`                           |
| `<nama>.test.ts`    | Integration test dengan Postgres sungguhan, termasuk isolasi tenant  |

Tidak ada DI container. `Deps` (db, auth, mailer, storage, queue) dirakit sekali di `deps.ts` dan dibawa lewat context oRPC, sehingga test bisa menukarnya dengan versi in-memory.

Rantai middleware (`src/orpc.ts`):

1. `authed`: `AuthPort.authenticate` → `resolveUser` (membuat atau menautkan user kita).
2. `tenantRead`: membaca `x-tenant-slug`, memeriksa membership, menyediakan `context.tx()` (transaksi ber-RLS) dan `role`. Tenant tidak dikenal dan bukan-member sama-sama dijawab `NOT_FOUND`.
3. `tenantWrite`: seperti `tenantRead`, tetapi menolak mutasi saat langganan `suspended`.

`AsyncLocalStorage` (`@starter/platform/context`) menyimpan `requestId`, `tenantId`, `userId`, `locale`; logger, audit log, dan job membacanya otomatis. Environment divalidasi Zod saat startup (`src/env.ts`).

## 6. Database dan migrasi

Postgres adalah sumber kebenaran: migrasi mengubah DB, lalu `kysely-codegen` menghasilkan `packages/db/src/types.ts`.

| Perintah             | Fungsi                                                |
| -------------------- | ----------------------------------------------------- |
| `pnpm db:new <nama>` | Membuat file migrasi bertimestamp dan mendaftarkannya |
| `pnpm db:migrate`    | Menjalankan migrasi, lalu regenerasi tipe             |
| `pnpm db:rollback`   | Membatalkan migrasi terakhir                          |
| `pnpm db:seed`       | Mengisi plan (idempoten)                              |
| `pnpm db:reset`      | Drop, migrate, seed. Hanya untuk dev                  |
- Migrasi didaftarkan statis di `src/migrations/index.ts`, sehingga ikut ter-bundle ke `dist/migrate.js` di production.
- Primary key UUIDv7 dibuat di aplikasi (`newId()`).
- Setiap tabel tenant memakai `withBaseColumns` + `enableTenantRls`.
- Migrasi production dijalankan oleh entrypoint container role web (`RUN_MIGRATIONS=true`) sebelum container baru menerima traffic.

## 7. Multi-tenancy dan otorisasi

**Isolasi dua lapis:**

1. Repo selalu memfilter `tenant_id`.
2. RLS: policy `tenant_isolation` memeriksa `app.tenant_id`. `withTenant(db, id, fn)` membuka transaksi dan men-set nilai itu secara lokal pada transaksi.

Aplikasi terhubung sebagai role **non-superuser** (`app`), karena superuser selalu melewati RLS. Tabel memakai `FORCE ROW LEVEL SECURITY` agar pemilik tabel pun terkena policy.

`withSystem(db, fn)` melewati RLS untuk pekerjaan lintas tenant yang tepercaya (daftar membership milik user, webhook, job billing, seed). Jangan pernah memanggilnya dengan input langsung dari request.

**Identifikasi tenant:** berbasis path (`app.domain.com/{slug}/...`). Dashboard mengirim slug sebagai header `x-tenant-slug`. Subdomain atau custom domain bisa ditambahkan di satu tempat (middleware `tenantRead`).

**Otorisasi:** role `owner > admin > member` per membership, dan fungsi policy di `src/core/policy.ts` (`policy.deleteProject(role)`). Clerk Organizations sengaja tidak dipakai.

**Anggota:** tenant selalu punya tepat satu owner (partial unique index `memberships_one_owner`); kepemilikan hanya berpindah lewat `members.transferOwnership`, yang menurunkan owner lama menjadi admin dalam transaksi yang sama. Owner mengelola semua orang; admin hanya mengelola member biasa, dan hanya owner yang boleh memberi role admin (lewat ubah role maupun undangan; undangan admin juga hanya bisa dikirim ulang atau dibatalkan owner); member hanya bisa keluar. Owner tidak bisa keluar tanpa mentransfer. Saat undangan diterima, `max_members` dicek ulang terhadap anggota yang sudah terkonfirmasi.

## 8. Auth yang bisa diganti

`AuthPort` (`packages/auth/src/port.ts`) hanya menjawab "identitas mana di provider mana yang membuat request ini".

- User ID dari provider **tidak pernah** jadi foreign key. Pemetaannya di `auth_identities(provider, external_id, user_id)`.
- User dibuat atau ditautkan saat pertama terlihat (`resolveUser`), jadi tidak bergantung pada webhook.
- Penautan ke user lama berdasarkan email hanya jika provider menyatakan email **terverifikasi**.
- Frontend memakai `@starter/auth/react` (`AuthProvider`, `useClientAuth`, `SignInView`, `UserMenu`), tidak pernah `@clerk/react` langsung.
- Setiap adapter wajib lolos `describeAuthPortContract` (`@starter/auth/testing`).

**Mode dev:** `AUTH_PROVIDER=fake` + `VITE_AUTH_PROVIDER=dev` memungkinkan login dengan email apa pun tanpa akun Clerk. API menolak start dengan mode ini di production.

**Migrasi ke Better Auth:** tulis adapter baru, pastikan lolos test kontrak, ganti di `deps.ts` dan `packages/auth/src/react`. Identitas lama tertaut otomatis lewat email terverifikasi. Modul bisnis tidak tersentuh.

## 9. i18n

| Lapisan   | Pendekatan                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------- |
| Pesan     | `packages/i18n/messages/{id,en}.json`, dikompilasi Paraglide (`pnpm --filter @starter/i18n build`, otomatis via Turborepo) |
| Landing   | Prefix bahasa di URL, `hreflang`, sitemap per bahasa                                                                       |
| Dashboard | `users.locale`, fallback `tenants.default_locale`. Tanpa prefix URL                                                        |
| Server    | Locale diberikan eksplisit: `m.email_invite_subject(inputs, { locale })`                                                   |
| Format    | `Intl` untuk tanggal, angka, mata uang                                                                                     |

Konten milik tenant multi-bahasa ditunda. Bila dibutuhkan: mulai dengan kolom JSONB per field, naik ke tabel `<entitas>_translations` hanya bila perlu full-text search per bahasa.

## 10. Billing (Model 1)

Tenant membayar langganan ke platform. Billing engine milik sendiri (`apps/api/src/core/billing.ts`); payment gateway hanya adapter (`PaymentGateway` di `@starter/platform/payment`), ditulis saat produk pertama membutuhkannya.

```
trialing → active ─(7 hari sebelum periode habis: invoice)─▶ dibayar → active (periode baru)
                                                          └▶ lewat jatuh tempo → past_due
                                                             └▶ + grace 7 hari → suspended (read-only)
```

- Tenant baru mendapat trial 14 hari pada plan `pro`.
- Job harian `billing.cycle` membuat invoice dan memajukan status. Idempoten.
- `markInvoicePaid` dipanggil handler webhook; idempoten terhadap webhook ganda. Idempotensi per event disimpan di `payment_events`.
- Kode fitur memeriksa entitlement (`entitlement(trx, tenantId, 'max_members')`), bukan nama plan.
- `suspended` berarti read-only: data tetap bisa dibaca dan diekspor.

## 11. Upload, email, dan jobs

**Upload:** `files.createUpload` membuat baris `pending` + presigned PUT URL (ukuran dan tipe ikut ditandatangani) → browser mengunggah langsung ke storage → `files.completeUpload` memverifikasi objek → `ready`. Key: `tenants/{tenantId}/{fileId}`. Job per jam menghapus upload `pending` yang lebih dari 24 jam.

**Email:** template React Email + Paraglide di `apps/api/src/emails`. Selalu dikirim lewat job `email.send` (retry otomatis), dicatat di `email_log`. Pengirim: `Nama Tenant via App <noreply@...>` dengan `reply-to` pengundang. Dev memakai Mailpit (`http://localhost:8025`).

**Jobs:** pg-boss di Postgres. Definisi (nama + schema) di `jobs/definitions.ts`; handler di `jobs/handlers.ts`. Payload yang membawa `tenantId` dijalankan dalam konteks tenant tersebut. Worker memakai image yang sama: `node dist/worker.js`. Di development, job dijalankan di dalam proses API agar cukup satu proses.

## 12. Observability dan audit

| Kebutuhan      | Implementasi                                                               |
| -------------- | -------------------------------------------------------------------------- |
| Log            | pino JSON ke stdout dengan `requestId`, `tenantId`, `userId`               |
| Error tracking | Sentry SDK bila `SENTRY_DSN` diisi (kompatibel dengan GlitchTip self-host) |
| Health         | `/healthz` (proses hidup), `/readyz` (DB tersambung; dipakai Kamal)        |
| Audit log      | `audit_events`, ditulis dari service lewat `recordAudit`                   |
| Rate limit     | 300 request/menit per IP; 10/menit per user pada invite                    |

Counter rate limit disimpan di memori: cukup untuk satu VPS, perlu store bersama bila API di-scale out.

## 13. Kualitas

| Tahap                           | Isi                                                                      |
| ------------------------------- | ------------------------------------------------------------------------ |
| pre-commit (Lefthook)           | Biome pada file yang di-stage                                            |
| pre-push (Lefthook)             | Batas dependensi + `turbo typecheck test --affected`                     |
| CI (`.github/workflows/ci.yml`) | Lint, batas dependensi, typecheck, test, build dengan Postgres sungguhan |

Strategi test: unit test untuk policy dan util; integration test API dengan Postgres sungguhan (`TEST_DATABASE_URL`) dan fake untuk setiap vendor; test kontrak untuk adapter; test isolasi tenant untuk setiap modul.

## 14. Deploy

Satu VPS 1–2 GB cukup: satu image Docker menjalankan API sekaligus menyajikan SPA, worker memakai image yang sama, dan Postgres di server yang sama. Landing page di CDN.

- `Dockerfile` multi-stage: API di-bundle esbuild menjadi `dist/server.js`, `dist/worker.js`, `dist/migrate.js`; runtime hanya memasang paket yang tidak bisa di-bundle.
- `config/deploy.yml` (Kamal 2): role `web` dan `worker`, accessory Postgres, health check `/readyz`.
- Secrets di `.kamal/secrets` (gitignored; lihat `.kamal/secrets.example`).
- Backup Postgres: `scripts/backup.sh` + cron, lihat [Backup dan restore](#backup-dan-restore).

### Backup dan restore

`scripts/backup.sh` dijalankan di host VPS (butuh `docker` dan CLI `aws`, keduanya tidak ada di image aplikasi). Skrip membuat dump dengan `pg_dump -Fc` di dalam accessory Postgres Kamal (`starter-db`), memeriksanya dengan `pg_restore --list`, lalu meng-upload ke `BACKUP_S3_URI` sebagai `<db>-<timestamp UTC>.dump`. Tidak ada yang di-upload bila dump kosong atau tidak terbaca. Antrean job berada di database yang sama, jadi ikut tercakup.

```bash
# /etc/starter-backup.env (chmod 600): BACKUP_S3_URI, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
15 2 * * *  . /etc/starter-backup.env && /opt/starter/backup.sh >> /var/log/starter-backup.log 2>&1
```

- Pakai bucket terpisah dari upload pengguna, dan pasang lifecycle rule (misalnya hapus setelah 30 hari). Retensi bukan tugas skrip.
- File yang di-upload pengguna ada di object storage dan **tidak** ikut dump ini. Aktifkan versioning atau replikasi pada bucket itu bila perlu.
- `DRY_RUN=1 scripts/backup.sh` hanya menampilkan perintah yang akan dijalankan.

**Restore** (aplikasi tetap melayani dari database lama sampai langkah tukar):

```bash
# 1. Ambil dump
aws --endpoint-url "$S3_ENDPOINT" s3 ls s3://my-backups/starter/
aws --endpoint-url "$S3_ENDPOINT" s3 cp s3://my-backups/starter/app-<timestamp>.dump /tmp/restore.dump

# 2. Restore ke database BARU. Jangan pakai --no-owner: role app harus memiliki tabel,
#    karena FORCE ROW LEVEL SECURITY berlaku untuk pemilik tabel dan `app` bukan superuser.
docker exec starter-db psql -U postgres -c "create database app_restore owner app"
docker exec -i starter-db pg_restore -U postgres -d app_restore --exit-on-error < /tmp/restore.dump

# 3. Periksa: jumlah baris dan jumlah migrasi yang sudah terpasang
docker exec starter-db psql -U postgres -d app_restore -c "select count(*) from tenants" -c "select count(*) from kysely_migration"

# 4. Tukar (rename butuh nol koneksi terbuka, jadi hentikan aplikasi dulu)
kamal app stop
docker exec starter-db psql -U postgres -c "alter database app rename to app_old" -c "alter database app_restore rename to app"
kamal app boot
```

Simpan `app_old` sampai data hasil restore dipastikan benar, lalu hapus. Backup yang belum pernah di-restore hanyalah tebakan: restore dump terbaru ke database sementara sebulan sekali dan jalankan pemeriksaan langkah 3.


## 15. Admin platform

Back-office untuk **pemilik platform**, bukan untuk admin tenant: melihat dan mengelola semua tenant (perpanjang trial, ganti plan, suspend atau pulihkan workspace), mencari user, mengulang job yang gagal, dan membaca audit log platform. Fitur tingkat tenant (anggota, billing, dan pengaturan satu tenant) tetap di `apps/web`.

Ini satu-satunya kode yang sengaja melintasi batas tenant (`withSystem`), jadi diisolasi di setiap lapisan:

| Lapisan    | Isolasi                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| App        | `apps/admin`: SPA Vite dan bundle sendiri (`pnpm --filter @starter/admin dev`, port 5174)             |
| Kontrak    | `@starter/contracts/admin`, tidak pernah di-re-export dari `@starter/contracts`                       |
| API        | `apps/api/src/admin`, di-mount di `/api/admin/rpc`; bukan di bawah `src/modules`                      |
| Host       | Di production API hanya menjawab di `ADMIN_HOST`; satu image menyajikan kedua SPA, dipilih lewat Host |
| Library UI | source shadcn/ui di dalam `apps/admin` (lihat di bawah)                                               |
| Audit      | `platform_audit_events`, terpisah dari `audit_events` milik tenant                                    |

**Akses (semua lapisan wajib).**

1. **Identitas:** `AuthPort` dan `resolveUser` yang sama dengan API utama.
2. **Allowlist:** `PLATFORM_ADMINS` (email dipisah koma). Platform admin bukan membership tenant dan tidak ada role baru di `memberships`. Email harus **terverifikasi** di provider auth: `resolveUser` membuat user dari email yang belum terverifikasi bila belum ada pemiliknya, jadi tanpa pengecekan itu siapa pun bisa mendaftar dengan alamat yang ada di allowlist. Non-admin mendapat `NOT_FOUND` agar API tidak membocorkan keberadaannya; daftar kosong atau tidak diisi menonaktifkan API admin sepenuhnya.
3. **Host:** di production `/api/admin/rpc` hanya menjawab bila host request sama dengan `ADMIN_HOST`; host lain mendapat 404.
4. **Lapisan jaringan (opsional):** bila `CF_ACCESS_TEAM_DOMAIN` dan `CF_ACCESS_AUD` diisi, JWT `Cf-Access-Jwt-Assertion` diverifikasi terhadap JWKS tim (issuer dan audience dicek, kunci tidak di-hardcode).

**Audit.** Setiap mutasi wajib memberi `reason` (minimal 5 karakter) dan menulis tepat satu baris `platform_audit_events` dalam transaksi yang sama dengan perubahannya. Aturannya sendiri adalah fungsi di `core/billing.ts` (`extendTrial`, `changePlan`, `setSuspended`); service admin hanya memanggilnya. Untuk `jobs.retry`, baris audit ditulis lebih dulu di dalam transaksi yang menjalankan retry, karena antrean punya koneksi sendiri: retry tidak pernah terjadi tanpa barisnya, dan retry yang ditolak tidak meninggalkan baris. Tabelnya memakai row level security yang hanya dilewati `withSystem`, sehingga transaksi tenant tidak melihat baris apa pun, bahkan karena kekeliruan.

**Dua sistem UI, tidak pernah dicampur.** UI produk (`apps/web`, `apps/site`) memakai `@starter/ui`: komponen milik sendiri dengan token semantik dan tema yang bisa diganti, karena tiap produk punya tampilannya sendiri. Admin adalah alat internal berbahasa Inggris yang tidak butuh tema tetapi butuh tabel data, dialog, dan command palette yang matang, jadi memakai shadcn/ui, yang komponennya disalin ke `apps/admin/src/components/ui` dan dimiliki seperti source lain. `apps/admin` tidak pernah mengimpor `@starter/ui`, dan komponen shadcn tidak pernah dipindah ke `packages/ui` apa adanya. `pnpm check:boundaries` menegakkannya, bersama aturan: hanya `apps/admin`, `apps/api/src/admin`, dan `packages/contracts` yang boleh mengimpor `@starter/contracts/admin`; tidak ada yang di luar `apps/admin` boleh mengimpor darinya.

**Di luar cakupan:** impersonasi ("login sebagai user"), menghapus tenant, mengedit data bisnis tenant, dashboard pendapatan dan metrik, aksi massal, broadcast email.

## 16. Ditunda atau tidak dilakukan

| Item                                  | Status          | Pemicu                                               |
| ------------------------------------- | --------------- | ---------------------------------------------------- |
| Model 2 (tenant menagih pelanggannya) | Tidak dilakukan | Ada produk yang benar-benar membutuhkannya           |
| Adapter payment gateway               | Ditunda         | Produk pertama yang menagih                          |
| Konten tenant multi-bahasa            | Ditunda         | Tenant meminta                                       |
| Custom domain per tenant              | Ditunda         | Fitur jual; kemungkinan bersamaan dengan Better Auth |
| OG image otomatis (Satori)            | Ditunda         | Saat landing page mulai dipromosikan                 |
| E2E Playwright                        | Ditunda         | Alur kritis pertama di produk nyata                  |
| RBAC dinamis                          | Ditunda         | Tenant meminta role kustom                           |
| Tracing, log aggregation              | Ditunda         | Debugging lintas service mulai sulit                 |
| SSR dashboard                         | Ditunda         | Migrasi ke TanStack Start bila dibutuhkan            |
| Redis                                 | Tidak dilakukan | Postgres sudah menangani antrean dan cron            |
