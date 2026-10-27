/** Postgres unique_violation (e.g. duplicate slug). */
export const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
