import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

process.env.NODE_ENV = 'test'
const envFile = resolve(import.meta.dirname, '../../../../.env')
if (existsSync(envFile) && !process.env.TEST_DATABASE_URL) process.loadEnvFile(envFile)
