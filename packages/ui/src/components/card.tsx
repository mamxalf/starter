import type { ComponentProps } from 'react'
import { tv } from 'tailwind-variants'

export const cardStyles = tv({
  slots: {
    root: 'rounded-ui border-ui bg-surface text-surface-foreground shadow-ui backdrop-blur-ui',
    header: 'flex flex-col gap-1 p-5 pb-0',
    title: 'font-display text-lg font-semibold',
    description: 'text-sm text-muted-foreground',
    body: 'p-5',
    footer: 'flex items-center gap-2 p-5 pt-0',
  },
})

const s = cardStyles()

export const Card = ({ className, ...p }: ComponentProps<'div'>) => (
  <div className={s.root({ className })} {...p} />
)
export const CardHeader = ({ className, ...p }: ComponentProps<'div'>) => (
  <div className={s.header({ className })} {...p} />
)
export const CardTitle = ({ className, ...p }: ComponentProps<'h3'>) => (
  <h3 className={s.title({ className })} {...p} />
)
export const CardDescription = ({ className, ...p }: ComponentProps<'p'>) => (
  <p className={s.description({ className })} {...p} />
)
export const CardBody = ({ className, ...p }: ComponentProps<'div'>) => (
  <div className={s.body({ className })} {...p} />
)
export const CardFooter = ({ className, ...p }: ComponentProps<'div'>) => (
  <div className={s.footer({ className })} {...p} />
)
