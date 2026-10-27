import { z } from 'zod'

const Env = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(3000),
    APP_URL: z.url().default('http://localhost:5173'),
    DATABASE_URL: z.string().min(1),
    /** Path to the built SPA (served same-origin). Unset in dev: Vite serves it. */
    WEB_DIST: z.string().optional(),

    AUTH_PROVIDER: z.enum(['clerk', 'fake']).default('clerk'),
    CLERK_SECRET_KEY: z.string().optional(),
    CLERK_PUBLISHABLE_KEY: z.string().optional(),

    MAIL_DRIVER: z.enum(['smtp', 'resend', 'memory']).default('smtp'),
    MAIL_FROM: z.string().default('App <noreply@localhost>'),
    SMTP_URL: z.string().default('smtp://localhost:1025'),
    RESEND_API_KEY: z.string().optional(),

    STORAGE_DRIVER: z.enum(['s3', 'memory']).default('s3'),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default('auto'),
    S3_BUCKET: z.string().default('app'),
    S3_ACCESS_KEY_ID: z.string().default(''),
    S3_SECRET_ACCESS_KEY: z.string().default(''),

    SENTRY_DSN: z.string().optional(),

    /** Comma-separated emails allowed into the platform admin API. Empty/unset disables it. */
    PLATFORM_ADMINS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean),
      ),
    /** Hostname that serves the admin app and API in production, e.g. admin.example.com. */
    ADMIN_HOST: z
      .string()
      .regex(/^[a-z0-9.-]+(:\d+)?$/i, 'hostname only, without scheme or path')
      .optional(),
    /** Path to the built admin SPA, served when the request host equals ADMIN_HOST. */
    ADMIN_DIST: z.string().optional(),
    /** Cloudflare Access in front of the admin host (both or neither): <team>.cloudflareaccess.com */
    CF_ACCESS_TEAM_DOMAIN: z
      .string()
      .regex(/^[a-z0-9-]+\.cloudflareaccess\.com$/i, 'e.g. myteam.cloudflareaccess.com')
      .optional(),
    CF_ACCESS_AUD: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.AUTH_PROVIDER === 'clerk' && (!env.CLERK_SECRET_KEY || !env.CLERK_PUBLISHABLE_KEY)) {
      ctx.addIssue({
        code: 'custom',
        message: 'CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY are required',
      })
    }
    if (env.NODE_ENV === 'production' && env.AUTH_PROVIDER === 'fake') {
      ctx.addIssue({ code: 'custom', message: 'AUTH_PROVIDER=fake is not allowed in production' })
    }
    const badAdmin = env.PLATFORM_ADMINS.find((email) => !z.email().safeParse(email).success)
    if (badAdmin) {
      ctx.addIssue({ code: 'custom', message: `PLATFORM_ADMINS has an invalid email: ${badAdmin}` })
    }
    if (env.NODE_ENV === 'production' && env.PLATFORM_ADMINS.length > 0 && !env.ADMIN_HOST) {
      ctx.addIssue({
        code: 'custom',
        message: 'ADMIN_HOST is required when PLATFORM_ADMINS is set',
      })
    }
    if (Boolean(env.CF_ACCESS_TEAM_DOMAIN) !== Boolean(env.CF_ACCESS_AUD)) {
      ctx.addIssue({
        code: 'custom',
        message: 'CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD must be set together',
      })
    }
    if (env.MAIL_DRIVER === 'resend' && !env.RESEND_API_KEY) {
      ctx.addIssue({ code: 'custom', message: 'RESEND_API_KEY is required for MAIL_DRIVER=resend' })
    }
  })

export type Env = z.infer<typeof Env>

/** Fails fast at startup with a readable list of what is missing. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = Env.safeParse(source)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.') || 'env'}: ${i.message}`)
    throw new Error(`Invalid environment:\n${issues.join('\n')}`)
  }
  return result.data
}
