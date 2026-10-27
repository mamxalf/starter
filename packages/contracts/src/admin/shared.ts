import { z } from 'zod'

/** Why a platform admin is making a change. Required on every mutation and stored in the audit log. */
export const Reason = z.string().trim().min(5).max(500)
