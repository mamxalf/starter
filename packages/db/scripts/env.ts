import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/** Loads the repo-root .env (if present) and returns DATABASE_URL. */
export function databaseUrl(): string {
  const envFile = resolve(import.meta.dirname, '../../../.env')
  if (existsSync(envFile)) process.loadEnvFile(envFile)
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set (copy .env.example to .env)')
  return url
}
