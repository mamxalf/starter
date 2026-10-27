import type { Database } from './client'
import { newId } from './id'
import { withSystem } from './tenancy'

export const DEFAULT_PLANS = [
  { code: 'free', name: 'Free', price: 0, entitlements: { max_members: 3, custom_domain: false } },
  {
    code: 'pro',
    name: 'Pro',
    price: 149_000,
    entitlements: { max_members: 20, custom_domain: true },
  },
] as const

/** Idempotent: safe to run on every deploy. */
export async function seedPlans(db: Database): Promise<void> {
  await withSystem(db, async (trx) => {
    for (const p of DEFAULT_PLANS) {
      const plan = await trx
        .insertInto('plans')
        .values({ id: newId(), code: p.code, name: p.name, price: p.price, interval: 'month' })
        .onConflict((oc) => oc.column('code').doUpdateSet({ name: p.name, price: p.price }))
        .returning('id')
        .executeTakeFirstOrThrow()
      for (const [key, value] of Object.entries(p.entitlements)) {
        await trx
          .insertInto('plan_entitlements')
          .values({ plan_id: plan.id, key, value: JSON.stringify(value) })
          .onConflict((oc) =>
            oc.columns(['plan_id', 'key']).doUpdateSet({ value: JSON.stringify(value) }),
          )
          .execute()
      }
    }
  })
}
