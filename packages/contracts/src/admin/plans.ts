import { oc } from '@orpc/contract'
import { z } from 'zod'

export const Plan = z.object({
  code: z.string(),
  name: z.string(),
  price: z.number().int(),
  currency: z.string(),
  interval: z.enum(['month', 'year']),
})

export const plansContract = {
  /** Active plans, cheapest first. Feeds the plan picker of `tenants.changePlan`. */
  list: oc.output(z.array(Plan)),
}
