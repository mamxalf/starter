import { authed } from '../../orpc'
import { getMe, updateLocale } from './me.service'

export const meRouter = {
  get: authed.me.get.handler(({ context }) => getMe(context.deps.db, context.user)),

  updateLocale: authed.me.updateLocale.handler(async ({ context, input }) => {
    await updateLocale(context.deps.db, context.user.id, input.locale)
    return { ok: true as const }
  }),
}
