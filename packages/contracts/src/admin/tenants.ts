import { oc } from '@orpc/contract'
import { z } from 'zod'
import { Locale, Pagination, paginated, Role } from '../shared'
import { Reason } from './shared'

export const SubscriptionStatus = z.enum([
  'trialing',
  'active',
  'past_due',
  'suspended',
  'canceled',
])

export const TenantSummary = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  planCode: z.string().nullable(),
  planName: z.string().nullable(),
  status: SubscriptionStatus.nullable(),
  currentPeriodEnd: z.date().nullable(),
  memberCount: z.number().int(),
  createdAt: z.date(),
})

const TenantMember = z.object({
  userId: z.uuid(),
  email: z.string(),
  name: z.string().nullable(),
  role: Role,
  joinedAt: z.date(),
})

const TenantInvoice = z.object({
  id: z.uuid(),
  amount: z.number().int(),
  currency: z.string(),
  status: z.enum(['open', 'paid', 'void']),
  dueAt: z.date(),
  paidAt: z.date().nullable(),
  createdAt: z.date(),
})

/** An entry of the tenant's own `audit_events` (what its members did), not the platform audit log. */
const TenantAuditEvent = z.object({
  id: z.uuid(),
  action: z.string(),
  actorEmail: z.string().nullable(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.date(),
})

export const TenantDetail = z.object({
  tenant: z.object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    defaultLocale: Locale,
    customDomain: z.string().nullable(),
    createdAt: z.date(),
  }),
  subscription: z
    .object({
      status: SubscriptionStatus,
      currentPeriodEnd: z.date(),
      planCode: z.string(),
      planName: z.string(),
      price: z.number().int(),
      currency: z.string(),
      interval: z.enum(['month', 'year']),
    })
    .nullable(),
  members: z.array(TenantMember),
  /** Newest 20. */
  invoices: z.array(TenantInvoice),
  /** Newest 50. */
  auditEvents: z.array(TenantAuditEvent),
})

const TenantId = z.object({ tenantId: z.uuid() })

export const tenantsContract = {
  list: oc
    .input(
      Pagination.extend({
        /** Matches name or slug, case-insensitive. */
        q: z.string().trim().max(100).optional(),
        status: SubscriptionStatus.optional(),
      }),
    )
    .output(paginated(TenantSummary)),
  get: oc.input(TenantId).output(TenantDetail),
  /** Allowed for trialing, past_due and suspended. Result is `trialing` with a later period end. */
  extendTrial: oc
    .input(TenantId.extend({ days: z.number().int().min(1).max(60), reason: Reason }))
    .output(z.object({ status: SubscriptionStatus, currentPeriodEnd: z.date() })),
  /** No proration: the price changes from the next invoice, entitlements change immediately. */
  changePlan: oc
    .input(TenantId.extend({ planCode: z.string().min(1), reason: Reason }))
    .output(z.object({ planCode: z.string() })),
  /** Suspending makes the workspace read-only; unsuspending restores `active`. */
  setSuspended: oc
    .input(TenantId.extend({ suspended: z.boolean(), reason: Reason }))
    .output(z.object({ status: SubscriptionStatus })),
}
