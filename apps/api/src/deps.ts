import { type AuthPort, clerkAuth, fakeAuth } from '@starter/auth'
import { createDb, type Database } from '@starter/db'
import type { JobQueue } from '@starter/platform/jobs'
import { createMailer, type Mailer } from '@starter/platform/mail'
import { memoryStorage, type Storage, s3Storage } from '@starter/platform/storage'
import { createCfAccessVerifier } from './admin/cf-access'
import type { Env } from './env'

/**
 * Everything with a vendor behind it, wired once. Modules receive Deps through the
 * oRPC context, so tests swap in fakes (memory mailer, memory storage, fake auth, inline queue).
 */
export type Deps = {
  db: Database
  auth: AuthPort
  mailer: Mailer
  storage: Storage
  queue: JobQueue
  config: { appUrl: string; mailFrom: string }
  /** Platform admin API (apps/api/src/admin). Disabled when `platformAdmins` is empty. */
  admin: {
    /** Lowercased emails allowed in. */
    platformAdmins: string[]
    /** Production only: the admin API answers just on this host. */
    adminHost?: string
    /** Cloudflare Access check; absent when CF_ACCESS_* is not configured. */
    verifyAccess?: (request: Request) => Promise<boolean>
  }
}

/** Where the admin SPA is served from (Clerk must accept it as an authorized party). */
const adminOrigin = (env: Env) =>
  env.NODE_ENV === 'production' && env.ADMIN_HOST
    ? `https://${env.ADMIN_HOST}`
    : 'http://localhost:5174'

export function createDeps(env: Env, queue: JobQueue): Deps {
  return {
    db: createDb(env.DATABASE_URL),
    auth:
      env.AUTH_PROVIDER === 'fake'
        ? fakeAuth({}, { autoRegister: env.NODE_ENV !== 'production' })
        : clerkAuth({
            secretKey: env.CLERK_SECRET_KEY!,
            publishableKey: env.CLERK_PUBLISHABLE_KEY!,
            authorizedParties:
              env.PLATFORM_ADMINS.length > 0 ? [env.APP_URL, adminOrigin(env)] : [env.APP_URL],
          }),
    mailer:
      env.MAIL_DRIVER === 'resend'
        ? createMailer({ driver: 'resend', from: env.MAIL_FROM, apiKey: env.RESEND_API_KEY! })
        : env.MAIL_DRIVER === 'memory'
          ? createMailer({ driver: 'memory', from: env.MAIL_FROM })
          : createMailer({ driver: 'smtp', from: env.MAIL_FROM, url: env.SMTP_URL }),
    storage:
      env.STORAGE_DRIVER === 'memory'
        ? memoryStorage()
        : s3Storage({
            endpoint: env.S3_ENDPOINT,
            region: env.S3_REGION,
            bucket: env.S3_BUCKET,
            accessKeyId: env.S3_ACCESS_KEY_ID,
            secretAccessKey: env.S3_SECRET_ACCESS_KEY,
          }),
    queue,
    config: { appUrl: env.APP_URL, mailFrom: env.MAIL_FROM },
    admin: {
      platformAdmins: env.PLATFORM_ADMINS,
      adminHost: env.NODE_ENV === 'production' ? env.ADMIN_HOST : undefined,
      verifyAccess:
        env.CF_ACCESS_TEAM_DOMAIN && env.CF_ACCESS_AUD
          ? createCfAccessVerifier({
              teamDomain: env.CF_ACCESS_TEAM_DOMAIN,
              audience: env.CF_ACCESS_AUD,
            })
          : undefined,
    },
  }
}
