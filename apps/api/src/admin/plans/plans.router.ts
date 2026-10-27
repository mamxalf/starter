import { withSystem } from '@starter/db'
import { platformAdmin } from '../orpc'

export const plansRouter = {
  list: platformAdmin.plans.list.handler(async ({ context }) => {
    const rows = await withSystem(context.deps.db, (trx) =>
      trx
        .selectFrom('plans')
        .select(['code', 'name', 'price', 'currency', 'interval'])
        .where('is_active', '=', true)
        .orderBy('price')
        .orderBy('code')
        .execute(),
    )
    return rows.map((p) => ({ ...p, interval: p.interval as 'month' | 'year' }))
  }),
}
