import { type AuthPort, clerkAuth, fakeAuth } from '@starter/auth'
import { createDb, type Database } from '@starter/db'
import type { JobQueue } from '@starter/platform/jobs'
import { createMailer, type Mailer } from '@starter/platform/mail'
import { memoryStorage, type Storage, s3Storage } from '@starter/platform/storage'
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
}

export function createDeps(env: Env, queue: JobQueue): Deps {
  return {
    db: createDb(env.DATABASE_URL),
    auth:
      env.AUTH_PROVIDER === 'fake'
        ? fakeAuth({}, { autoRegister: env.NODE_ENV !== 'production' })
        : clerkAuth({
            secretKey: env.CLERK_SECRET_KEY!,
            publishableKey: env.CLERK_PUBLISHABLE_KEY!,
            authorizedParties: [env.APP_URL],
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
  }
}
